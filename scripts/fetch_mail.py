#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Client IMAP/SMTP Sécurisé Zimbra Unicaen (imap.unicaen.fr:993 / smtp.unicaen.fr:465)
Supporte multi-dossiers (INBOX, Sent, Drafts, Trash), threading, marquage lu/non-lu,
suppression, enregistrement de brouillons IMAP et envoi SMTP avec copie dans Envoyés.
"""

import argparse
import base64
import email
from email.header import decode_header
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr, parsedate_to_datetime
import imaplib
import json
import os
import re
import smtplib
import ssl
import sys
import time
import requests

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

IMAP_HOST = os.environ.get("IMAP_HOST", "imap.unicaen.fr")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.unicaen.fr")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_credentials():
    user = os.environ.get("ENT_USER")
    pwd = os.environ.get("ENT_PASS")
    if user and pwd:
        return user, pwd

    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("ENT_USER="):
                    user = line.split("=", 1)[1].strip()
                elif line.startswith("ENT_PASS="):
                    pwd = line.split("=", 1)[1].strip()

    if not user or not pwd:
        raise ValueError("Identifiants ENT manquants dans .env (ENT_USER / ENT_PASS)")
    return user, pwd


def get_imap_client():
    user, pwd = get_credentials()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    client = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ctx)
    client.login(user, pwd)
    return client


def resolve_student_email(user, pwd):
    """Récupère l'adresse e-mail institutionnelle réelle via Zimbra SOAP GetInfoRequest."""
    try:
        r_auth = requests.post(
            "https://webmail.unicaen.fr/service/soap",
            json={
                "Header": {"context": {"_jsns": "urn:zimbra"}},
                "Body": {
                    "AuthRequest": {
                        "_jsns": "urn:zimbraAccount",
                        "account": {"by": "name", "_content": user},
                        "password": {"_content": pwd},
                    }
                },
            },
            timeout=8,
        )
        tok = r_auth.json()["Body"]["AuthResponse"]["authToken"][0]["_content"]
        r_info = requests.post(
            "https://webmail.unicaen.fr/service/soap",
            json={
                "Header": {"context": {"_jsns": "urn:zimbra", "authToken": [{"_content": tok}]}},
                "Body": {"GetInfoRequest": {"_jsns": "urn:zimbraAccount"}},
            },
            timeout=8,
        )
        email_addr = r_info.json()["Body"]["GetInfoResponse"].get("name")
        if email_addr and "@" in email_addr:
            return email_addr
    except Exception:
        pass
    return f"{user}@unicaen.fr"


def decode_mime_str(val):
    if not val:
        return ""
    try:
        dh = decode_header(val)
        res = []
        for part, enc in dh:
            if isinstance(part, bytes):
                try:
                    res.append(part.decode(enc or "utf-8", errors="ignore"))
                except Exception:
                    res.append(part.decode("iso-8859-1", errors="ignore"))
            else:
                res.append(str(part))
        return "".join(res)
    except Exception:
        return str(val)


def extract_resource_code(subject):
    if not subject:
        return None
    m = re.search(r"\b(R\d{3}|SAE\d{2}|SAÉ\d{2})\b", subject, re.IGNORECASE)
    if m:
        return m.group(1).upper().replace("É", "E")
    return None


def compute_thread_key(subject: str, message_id: str, in_reply_to: str, references: str) -> str:
    if references:
        first_ref = references.strip().split()[0]
        if first_ref:
            return first_ref
    if in_reply_to:
        return in_reply_to.strip()
    norm = re.sub(r"^(?:re|fwd|tr|aw)\s*:\s*", "", subject or "", flags=re.IGNORECASE).strip().lower()
    return f"subj:{norm}" if norm else message_id


def select_folder(client, folder: str, readonly: bool = True):
    target = folder or "INBOX"
    typ, data = client.select(f'"{target}"', readonly=readonly)
    if typ != "OK":
        typ, data = client.select(target, readonly=readonly)
    if typ != "OK":
        raise RuntimeError(f"Impossible d'ouvrir le dossier '{target}' : {data}")
    return data


def has_seen_flag(fetch_data) -> bool:
    """Vérifie si le flag \\Seen est présent dans n'importe quelle partie de la réponse IMAP FETCH."""
    for item in fetch_data or []:
        if isinstance(item, tuple):
            for part in item:
                if isinstance(part, bytes) and b"\\Seen" in part:
                    return True
        elif isinstance(item, bytes) and b"\\Seen" in item:
            return True
    return False


def cmd_list(limit=500, offset=0, folder="INBOX"):
    client = get_imap_client()
    try:
        data = select_folder(client, folder, readonly=True)
        total_count = int(data[0].decode())

        typ_unseen, unseen_ids = client.uid("SEARCH", None, "UNSEEN")
        unseen_set = set(unseen_ids[0].split()) if typ_unseen == "OK" and unseen_ids[0] else set()
        unread_count = len(unseen_set)

        typ_all, all_ids = client.uid("SEARCH", None, "ALL")
        if typ_all != "OK" or not all_ids[0]:
            print(json.dumps({"success": True, "folder": folder, "totalCount": total_count, "unreadCount": 0, "messages": []}))
            return

        id_list = all_ids[0].split()
        id_list.reverse()
        if limit and limit > 0:
            slice_ids = id_list[offset : offset + limit]
        else:
            slice_ids = id_list[offset:]

        # Batch FETCH par paquets de 150 UIDs pour synchroniser tous les mails en ~1s
        raw_by_uid = {}
        chunk_size = 150
        for i in range(0, len(slice_ids), chunk_size):
            chunk = slice_ids[i : i + chunk_size]
            uid_seq = b",".join(chunk)
            typ_f, fetch_data = client.uid(
                "FETCH",
                uid_seq,
                "(FLAGS BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO CC DATE MESSAGE-ID IN-REPLY-TO REFERENCES)])",
            )
            if typ_f != "OK" or not fetch_data:
                continue

            idx = 0
            while idx < len(fetch_data):
                item = fetch_data[idx]
                if isinstance(item, tuple) and len(item) >= 2:
                    meta_bytes = item[0]
                    raw_header = item[1]
                    trailing_bytes = (
                        fetch_data[idx + 1]
                        if idx + 1 < len(fetch_data) and isinstance(fetch_data[idx + 1], bytes)
                        else b""
                    )
                    m_uid = re.search(rb"\bUID\s+(\d+)", meta_bytes)
                    if m_uid:
                        uid_key = m_uid.group(1)
                        seen = (b"\\Seen" in meta_bytes) or (b"\\Seen" in trailing_bytes) or (uid_key not in unseen_set)
                        raw_by_uid[uid_key] = (raw_header, seen)
                    idx += 2 if trailing_bytes else 1
                else:
                    idx += 1

        messages = []
        for uid_bytes in slice_ids:
            entry = raw_by_uid.get(uid_bytes)
            if not entry:
                continue
            raw_header, seen = entry
            uid_str = uid_bytes.decode()
            is_unread = uid_bytes in unseen_set if unseen_set else (not seen)

            msg = email.message_from_bytes(raw_header)

            subject = decode_mime_str(msg.get("Subject", "")).strip() or "(Sans objet)"
            from_decoded = decode_mime_str(msg.get("From", "")).strip()
            to_decoded = decode_mime_str(msg.get("To", "")).strip()
            cc_decoded = decode_mime_str(msg.get("Cc", "")).strip()
            name_part, addr_part = parseaddr(from_decoded)
            sender_name = name_part or addr_part

            message_id = (msg.get("Message-ID") or "").strip()
            in_reply_to = (msg.get("In-Reply-To") or "").strip()
            references = (msg.get("References") or "").strip()

            raw_date = msg.get("Date", "")
            iso_date = raw_date
            try:
                dt = parsedate_to_datetime(raw_date)
                iso_date = dt.isoformat()
            except Exception:
                pass

            res_code = extract_resource_code(subject)

            messages.append({
                "id": uid_str,
                "seq": int(uid_str),
                "folder": folder,
                "subject": subject,
                "from": from_decoded,
                "senderName": sender_name,
                "to": to_decoded,
                "cc": cc_decoded,
                "date": iso_date,
                "isUnread": is_unread,
                "hasAttachments": False,
                "resourceCode": res_code,
                "messageId": message_id,
                "inReplyTo": in_reply_to,
                "references": references,
                "threadKey": compute_thread_key(subject, message_id, in_reply_to, references),
            })

        print(json.dumps({
            "success": True,
            "folder": folder,
            "totalCount": total_count,
            "unreadCount": unread_count,
            "messages": messages,
        }, ensure_ascii=False))

    finally:
        try:
            client.close()
        except Exception:
            pass
        client.logout()


def cmd_get(msg_uid, folder="INBOX"):
    client = get_imap_client()
    try:
        # Ouvrir en lecture/écriture pour marquer automatiquement comme lu (\Seen)
        select_folder(client, folder, readonly=False)
        typ, fetch_data = client.uid("FETCH", str(msg_uid).encode(), "(FLAGS RFC822)")
        if typ != "OK" or not fetch_data or not isinstance(fetch_data[0], tuple):
            raise RuntimeError(f"Message UID {msg_uid} introuvable dans {folder}")

        flags_seen = has_seen_flag(fetch_data)
        if not flags_seen:
            client.uid("STORE", str(msg_uid).encode(), "+FLAGS", "(\\Seen)")
        is_unread = False

        raw_bytes = fetch_data[0][1]
        msg = email.message_from_bytes(raw_bytes)

        subject = decode_mime_str(msg.get("Subject", "")).strip() or "(Sans objet)"
        from_str = decode_mime_str(msg.get("From", "")).strip()
        name_part, addr_part = parseaddr(from_str)
        sender_name = name_part or addr_part
        to_str = decode_mime_str(msg.get("To", "")).strip()
        cc_str = decode_mime_str(msg.get("Cc", "")).strip()
        message_id = (msg.get("Message-ID") or "").strip()
        in_reply_to = (msg.get("In-Reply-To") or "").strip()
        references = (msg.get("References") or "").strip()

        date_str = msg.get("Date", "")
        try:
            dt = parsedate_to_datetime(date_str)
            iso_date = dt.isoformat()
        except Exception:
            iso_date = date_str

        body_text = ""
        body_html = ""
        attachments = []

        part_counter = 0
        if msg.is_multipart():
            for part in msg.walk():
                part_counter += 1
                content_type = part.get_content_type()
                disposition = str(part.get("Content-Disposition", ""))

                filename = part.get_filename()
                if filename:
                    filename = decode_mime_str(filename)
                    payload = part.get_payload(decode=True)
                    size = len(payload) if payload else 0
                    attachments.append({
                        "filename": filename,
                        "contentType": content_type,
                        "size": size,
                        "partIndex": part_counter,
                    })
                elif content_type == "text/plain" and "attachment" not in disposition:
                    charset = part.get_content_charset() or "utf-8"
                    payload = part.get_payload(decode=True)
                    if payload:
                        try:
                            body_text = payload.decode(charset, errors="ignore")
                        except Exception:
                            body_text = payload.decode("iso-8859-1", errors="ignore")
                elif content_type == "text/html" and "attachment" not in disposition:
                    charset = part.get_content_charset() or "utf-8"
                    payload = part.get_payload(decode=True)
                    if payload:
                        try:
                            body_html = payload.decode(charset, errors="ignore")
                        except Exception:
                            body_html = payload.decode("iso-8859-1", errors="ignore")
        else:
            content_type = msg.get_content_type()
            charset = msg.get_content_charset() or "utf-8"
            payload = msg.get_payload(decode=True)
            if payload:
                decoded = payload.decode(charset, errors="ignore")
                if content_type == "text/html":
                    body_html = decoded
                else:
                    body_text = decoded

        preview = (body_text.strip() if body_text else re.sub(r"<[^>]+>", " ", body_html).strip())[:150]

        detail = {
            "id": str(msg_uid),
            "seq": int(msg_uid),
            "folder": folder,
            "subject": subject,
            "from": from_str,
            "senderName": sender_name,
            "to": to_str,
            "cc": cc_str,
            "date": iso_date,
            "isUnread": is_unread,
            "hasAttachments": len(attachments) > 0,
            "resourceCode": extract_resource_code(subject),
            "messageId": message_id,
            "inReplyTo": in_reply_to,
            "references": references,
            "threadKey": compute_thread_key(subject, message_id, in_reply_to, references),
            "preview": preview,
            "bodyText": body_text,
            "bodyHtml": body_html,
            "attachments": attachments,
        }

        print(json.dumps({"success": True, "message": detail}, ensure_ascii=False))

    finally:
        try:
            client.close()
        except Exception:
            pass
        client.logout()


def cmd_attachment(msg_uid, part_index, out_path=None, folder="INBOX"):
    client = get_imap_client()
    try:
        select_folder(client, folder, readonly=True)
        typ, fetch_data = client.uid("FETCH", str(msg_uid).encode(), "(RFC822)")
        if typ != "OK" or not fetch_data or not isinstance(fetch_data[0], tuple):
            raise RuntimeError("Message introuvable")

        raw_bytes = fetch_data[0][1]
        msg = email.message_from_bytes(raw_bytes)

        target_part = None
        part_counter = 0
        if msg.is_multipart():
            for part in msg.walk():
                part_counter += 1
                if part_counter == int(part_index):
                    target_part = part
                    break

        if not target_part:
            raise RuntimeError(f"Partie {part_index} introuvable")

        payload = target_part.get_payload(decode=True)
        filename = decode_mime_str(target_part.get_filename() or "piece_jointe")

        if out_path:
            with open(out_path, "wb") as f:
                f.write(payload)
            print(json.dumps({"success": True, "filename": filename, "size": len(payload)}))
        else:
            sys.stdout.buffer.write(payload)

    finally:
        try:
            client.close()
        except Exception:
            pass
        client.logout()


def cmd_mark_read(msg_uid, folder="INBOX", read=True):
    client = get_imap_client()
    try:
        select_folder(client, folder, readonly=False)
        op = "+FLAGS" if read else "-FLAGS"
        typ, _ = client.uid("STORE", str(msg_uid).encode(), op, "(\\Seen)")
        if typ != "OK":
            raise RuntimeError("Impossible de modifier l'état de lecture")
        print(json.dumps({"success": True, "id": str(msg_uid), "isUnread": not read}))
    finally:
        try:
            client.close()
        except Exception:
            pass
        client.logout()


def cmd_delete(msg_uid, folder="INBOX"):
    client = get_imap_client()
    try:
        select_folder(client, folder, readonly=False)
        if folder != "Trash":
            typ_copy, _ = client.uid("COPY", str(msg_uid).encode(), "Trash")
            if typ_copy != "OK":
                raise RuntimeError("Impossible de déplacer vers la Corbeille")
        client.uid("STORE", str(msg_uid).encode(), "+FLAGS", "(\\Deleted)")
        client.expunge()
        print(json.dumps({"success": True, "id": str(msg_uid), "folder": folder}))
    finally:
        try:
            client.close()
        except Exception:
            pass
        client.logout()


def build_mime_message(from_addr: str, data: dict) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = data.get("to", "")
    if data.get("cc"):
        msg["Cc"] = data["cc"]
    msg["Subject"] = data.get("subject", "(Sans objet)")
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="etu.unicaen.fr")

    if data.get("inReplyTo"):
        msg["In-Reply-To"] = data["inReplyTo"]
    if data.get("references"):
        msg["References"] = data["references"]

    body_html = data.get("bodyHtml") or ""
    body_text = data.get("bodyText") or re.sub(r"<[^>]+>", " ", body_html).strip()

    msg.set_content(body_text or " ")
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    for att in data.get("attachments") or []:
        raw_b64 = att.get("contentBase64", "")
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        if not raw_b64:
            continue
        file_bytes = base64.b64decode(raw_b64)
        ctype = att.get("contentType") or "application/octet-stream"
        maintype, subtype = ctype.split("/", 1) if "/" in ctype else ("application", "octet-stream")
        msg.add_attachment(
            file_bytes,
            maintype=maintype,
            subtype=subtype,
            filename=att.get("filename") or "piece_jointe",
        )

    return msg


def cmd_send():
    user, pwd = get_credentials()
    data = json.loads(sys.stdin.read())
    from_addr = data.get("from") or resolve_student_email(user, pwd)
    msg = build_mime_message(from_addr, data)

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=20) as smtp:
        smtp.login(user, pwd)
        smtp.send_message(msg)

    # Copier dans le dossier Sent IMAP
    try:
        client = get_imap_client()
        try:
            client.append("Sent", "\\Seen", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
        finally:
            client.logout()
    except Exception:
        pass

    print(json.dumps({
        "success": True,
        "messageId": msg["Message-ID"],
        "from": from_addr,
        "to": msg["To"],
        "subject": msg["Subject"],
    }, ensure_ascii=False))


def cmd_save_draft():
    user, pwd = get_credentials()
    data = json.loads(sys.stdin.read())
    from_addr = data.get("from") or resolve_student_email(user, pwd)
    msg = build_mime_message(from_addr, data)

    client = get_imap_client()
    try:
        client.append("Drafts", "\\Draft \\Seen", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
    finally:
        client.logout()

    print(json.dumps({"success": True, "messageId": msg["Message-ID"]}))


def cmd_resolve_gal():
    import unicodedata
    user, pwd = get_credentials()
    payload = json.loads(sys.stdin.read() or "{}")
    names = payload.get("names") or []

    def strip_accents(s: str) -> str:
        return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))

    r_auth = requests.post(
        "https://webmail.unicaen.fr/service/soap",
        json={
            "Header": {"context": {"_jsns": "urn:zimbra"}},
            "Body": {
                "AuthRequest": {
                    "_jsns": "urn:zimbraAccount",
                    "account": {"by": "name", "_content": user},
                    "password": {"_content": pwd},
                }
            },
        },
        timeout=10,
    )
    tok = r_auth.json()["Body"]["AuthResponse"]["authToken"][0]["_content"]

    teachers = {}
    for raw_name in names:
        clean = strip_accents(str(raw_name)).strip()
        if not clean or "inconnu" in clean.lower():
            continue
        try:
            r_gal = requests.post(
                "https://webmail.unicaen.fr/service/soap",
                json={
                    "Header": {"context": {"_jsns": "urn:zimbra", "authToken": [{"_content": tok}]}},
                    "Body": {
                        "SearchGalRequest": {
                            "_jsns": "urn:zimbraAccount",
                            "name": clean,
                            "type": "account",
                            "limit": 5,
                        }
                    },
                },
                timeout=8,
            )
            cns = r_gal.json().get("Body", {}).get("SearchGalResponse", {}).get("cn", [])
            for cn in cns:
                attrs = cn.get("_attrs") or {}
                display = cn.get("fileAsStr") or f"{attrs.get('firstName', '')} {attrs.get('lastName', '')}".strip() or raw_name
                for k, v in attrs.items():
                    if k.lower().startswith("email") and isinstance(v, str) and "@" in v:
                        addr = v.strip().lower()
                        if addr.endswith("@unicaen.fr") and not addr.endswith("@etu.unicaen.fr"):
                            teachers[addr] = display
        except Exception:
            continue

    result = [{"email": email_addr, "name": disp} for email_addr, disp in teachers.items()]
    print(json.dumps({"success": True, "teachers": result}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="Zimbra Unicaen IMAP/SMTP Client")
    parser.add_argument("--list", action="store_true", help="Lister les messages récents")
    parser.add_argument("--folder", type=str, default="INBOX", help="Dossier IMAP (INBOX, Sent, Drafts, Trash)")
    parser.add_argument("--limit", type=int, default=30, help="Nombre de messages")
    parser.add_argument("--offset", type=int, default=0, help="Décalage pagination")
    parser.add_argument("--get", type=str, help="UID du message à lire")
    parser.add_argument("--attachment", type=str, help="UID du message pour pièce jointe")
    parser.add_argument("--part", type=int, help="Index de la partie MIME de la pièce jointe")
    parser.add_argument("--out", type=str, help="Chemin de sortie pour sauvegarder la pièce jointe")
    parser.add_argument("--mark-read", type=str, help="UID à marquer comme lu")
    parser.add_argument("--mark-unread", type=str, help="UID à marquer comme non-lu")
    parser.add_argument("--delete", type=str, help="UID à supprimer / déplacer en Corbeille")
    parser.add_argument("--send", action="store_true", help="Envoyer un courriel via SMTP (JSON stdin)")
    parser.add_argument("--save-draft", action="store_true", help="Enregistrer un brouillon IMAP (JSON stdin)")
    parser.add_argument("--resolve-gal", action="store_true", help="Résoudre les emails des profs via Zimbra GAL (JSON stdin)")

    args = parser.parse_args()

    try:
        if args.list:
            cmd_list(args.limit, args.offset, args.folder)
        elif args.get:
            cmd_get(args.get, args.folder)
        elif args.attachment and args.part:
            cmd_attachment(args.attachment, args.part, args.out, args.folder)
        elif args.mark_read:
            cmd_mark_read(args.mark_read, args.folder, read=True)
        elif args.mark_unread:
            cmd_mark_read(args.mark_unread, args.folder, read=False)
        elif args.delete:
            cmd_delete(args.delete, args.folder)
        elif args.send:
            cmd_send()
        elif args.save_draft:
            cmd_save_draft()
        elif args.resolve_gal:
            cmd_resolve_gal()
        else:
            parser.print_help()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
