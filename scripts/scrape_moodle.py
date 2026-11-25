#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper Anti-Ban Moodle Unicaen (https://ecampus-vert.unicaen.fr/)
Récupère les cours, sections et documents pédagogiques (PDFs, CM, TP, Devoirs)
avec mise en cache de session CAS, réutilisation de cookies et délais de politesse.
"""

import sys
import os
import re
import json
import time
import random
import argparse
import requests
from urllib.parse import urljoin, unquote

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from cas_bridge import login_cas_with_bridge

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ECAMPUS_BASE = os.environ.get("ECAMPUS_BASE_URL", "https://ecampus-vert.unicaen.fr")
CAS_LOGIN_URL = os.environ.get("CAS_LOGIN_URL", "https://cas.unicaen.fr/login")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
SESSION_FILE = os.path.join(DATA_DIR, "moodle_session.json")
OUTPUT_FILE = os.path.join(DATA_DIR, "moodle_courses.json")
FILES_DIR = os.path.join(DATA_DIR, "moodle_files")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FILES_DIR, exist_ok=True)

def get_credentials():
    """Lit les identifiants ENT et secrets 2FA optionnels depuis l'environnement ou le fichier .env"""
    user = os.environ.get("ENT_USER")
    pwd = os.environ.get("ENT_PASS")
    totp_secret = os.environ.get("ENT_TOTP_SECRET")
    grid_raw = os.environ.get("ENT_2FA_GRID")
    preferred_method = os.environ.get("ENT_2FA_METHOD")

    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                v = v.strip()
                if k == "ENT_USER" and not user:
                    user = v
                elif k == "ENT_PASS" and not pwd:
                    pwd = v
                elif k == "ENT_TOTP_SECRET" and not totp_secret:
                    totp_secret = v
                elif k == "ENT_2FA_GRID" and not grid_raw:
                    grid_raw = v
                elif k == "ENT_2FA_METHOD" and not preferred_method:
                    preferred_method = v

    if not user or not pwd:
        raise ValueError("Identifiants ENT manquants (ENT_USER et ENT_PASS dans .env)")
    return user, pwd, totp_secret, grid_raw, preferred_method

def create_base_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    return s

def load_cached_session(session):
    """Charge les cookies sauvegardés et teste directement la session tant qu'elle est acceptée par Moodle."""
    if not os.path.exists(SESSION_FILE):
        return False, None

    try:
        with open(SESSION_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        cookies = data.get("cookies", {})
        sesskey = data.get("sesskey")
        if not cookies:
            return False, None

        for k, v in cookies.items():
            session.cookies.set(k, v, domain="ecampus-vert.unicaen.fr")

        print("[*] Vérification de la session en cache...")
        r = session.get(f"{ECAMPUS_BASE}/my/", allow_redirects=False, timeout=10)
        if r.status_code == 200 and "login" not in r.url and "cas.unicaen.fr/login" not in r.text:
            # Vérification du sesskey dans la page si non stocké
            m_sess = re.search(r'["\']sesskey["\']:\s*["\']([^"\']+)["\']', r.text)
            if m_sess:
                sesskey = m_sess.group(1)
            save_session(session, sesskey)
            print("[+] Session Moodle en cache valide ! Aucune ré-authentification CAS nécessaire.")
            return True, sesskey
    except Exception as e:
        print(f"[-] Erreur lecture session cache: {e}")

    return False, None

def save_session(session, sesskey):
    """Sauvegarde les cookies de session pour réutilisation future."""
    try:
        data = {
            "cookies": session.cookies.get_dict(),
            "sesskey": sesskey,
            "saved_at": time.time(),
        }
        with open(SESSION_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print("[+] Session Moodle sauvegardée dans le cache local.")
    except Exception as e:
        print(f"[-] Erreur sauvegarde session: {e}")

def login_cas(session, username, password, totp_secret=None, grid=None, preferred_method=None):
    """Authentification CAS Unicaen pour Moodle ecampus-vert via le Bridge 2FA (Grille + TOTP)."""
    cas_entry = f"{ECAMPUS_BASE}/login/index.php?authCAS=CAS"
    print(f"[*] Connexion CAS Unicaen via {cas_entry} ...")

    res = login_cas_with_bridge(
        session=session,
        service_url=cas_entry,
        username=username,
        password=password,
        totp_secret=totp_secret,
        grid=grid,
        preferred_method=preferred_method,
        cas_base=CAS_LOGIN_URL,
    )

    if res.get("requires2FA"):
        raise RuntimeError(
            "Authentification 2FA requise : configurez votre Grille de codes ou votre clé TOTP dans Mon Compte -> Sécurité & 2FA."
        )
    if not res.get("success"):
        raise RuntimeError(res.get("error") or "Échec de la validation CAS.")

    r_auth = res["response"]
    print(f"[+] Authentification CAS réussie (méthode: {res.get('method') or 'direct'}) ! URL finale : {r_auth.url}")
    m_sess = re.search(r'["\']sesskey["\']:\s*["\']([^"\']+)["\']', r_auth.text)
    sesskey = m_sess.group(1) if m_sess else ""

    save_session(session, sesskey)
    return sesskey

def extract_resource_code(title):
    """
    Extrait et normalise le code de Ressource ou SAÉ à partir du titre Moodle.
    Gère les variantes :
    - R109, R1.09, R1-09, R 109, R.1.09 -> R109
    - SAE12, SAE 1.2, SAE1.2, SAE-12, SAE 12 -> SAE12
    - SAE21, SAE 2.1, SAE2.01 -> SAE21
    - Détection contextuelle (Portfolio -> SAE16, Orientation/Insertion -> R112)
    """
    if not title:
        return None

    m_r = re.search(r'\b(?:R[.\s\-_]?([1-6])[.\s\-_]?(0?[1-9]|1[0-6]))\b', title, re.IGNORECASE)
    if m_r:
        sem = m_r.group(1)
        num = int(m_r.group(2))
        return f"R{sem}{num:02d}"

    m_sae = re.search(r'\b(?:SAE[.\s\-_]?([1-6])[.\s\-_]?(0?[1-6]))\b', title, re.IGNORECASE)
    if m_sae:
        sem = m_sae.group(1)
        num = int(m_sae.group(2))
        return f"SAE{sem}{num}"

    t_lower = title.lower()
    if "portfolio" in t_lower:
        return "SAE16"
    if "orientation" in t_lower and "insertion" in t_lower:
        return "R112"

    return None

def fetch_enrolled_courses(session, sesskey):
    """Récupère tous les cours inscrits (paginés, toutes classifications) via l'API AJAX Moodle."""
    ajax_url = f"{ECAMPUS_BASE}/lib/ajax/service.php?sesskey={sesskey}&info=core_course_get_enrolled_courses_by_timeline_classification"
    by_id = {}

    for classification in ("all", "inprogress", "past", "future", "hidden"):
        offset = 0
        while True:
            payload = [{
                "index": 0,
                "methodname": "core_course_get_enrolled_courses_by_timeline_classification",
                "args": {
                    "offset": offset,
                    "limit": 50,
                    "classification": classification,
                    "sort": "fullname"
                }
            }]
            r = session.post(ajax_url, json=payload, timeout=15)
            if r.status_code != 200:
                if classification == "all" and offset == 0:
                    raise RuntimeError(f"Erreur HTTP {r.status_code} sur l'API Moodle")
                break

            res = r.json()
            batch = []
            if res and isinstance(res, list) and "data" in res[0]:
                batch = res[0]["data"].get("courses", []) or []

            for c in batch:
                cid = c.get("id")
                if cid is not None and cid not in by_id:
                    by_id[cid] = c

            if len(batch) < 50:
                break
            offset += 50

    return list(by_id.values())

def clean_rich_html(raw_html):
    """Nettoie le HTML pédagogique Moodle tout en conservant le texte, listes et liens."""
    if not raw_html:
        return ""
    cleaned = re.sub(r'<script[\s\S]*?</script>', '', raw_html, flags=re.IGNORECASE)
    cleaned = re.sub(r'<style[\s\S]*?</style>', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\son\w+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)', '', cleaned, flags=re.IGNORECASE)
    # Rendre absolus les liens relatifs vers eCampus
    cleaned = re.sub(
        r'(href|src)=(["\'])(/(?:pluginfile|mod|course|theme)[^"\']+)\2',
        rf'\1=\2{ECAMPUS_BASE}\3\2',
        cleaned,
        flags=re.IGNORECASE,
    )
    # Ajouter target="_blank" aux liens qui n'en ont pas
    cleaned = re.sub(
        r'<a\b(?![^>]*\btarget=)([^>]*)>',
        r'<a target="_blank" rel="noreferrer"\1>',
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


def parse_modules_from_html(sec_html):
    """Extrait tous les modules Moodle d'un bloc HTML de section (compatible Moodle 3/4 & format Tiles)."""
    modules = []
    seen_mod_ids = set()
    # Découper par <li ... id="module-123" ...> quel que soit l'ordre des attributs
    li_parts = re.split(r'(<li[^>]+id=["\']module-\d+["\'][^>]*>)', sec_html, flags=re.DOTALL)

    for idx in range(1, len(li_parts), 2):
        li_open = li_parts[idx]
        mod_html = li_parts[idx + 1] if idx + 1 < len(li_parts) else ""
        m_id = re.search(r'id=["\']module-(\d+)["\']', li_open)
        if not m_id:
            continue
        mod_id = m_id.group(1)
        if mod_id in seen_mod_ids:
            continue
        seen_mod_ids.add(mod_id)

        m_cls = re.search(r'class=["\']([^"\']*)["\']', li_open)
        act_class = m_cls.group(1) if m_cls else ""

        # Cas spécial : Zone texte et média (modtype_label) qui n'a pas de lien /mod/...
        if "modtype_label" in act_class:
            m_lbl = re.search(
                r'<div[^>]+class=["\'][^"\']*(?:activity-altcontent|contentwithoutlink|no-overflow)[^"\']*["\'][^>]*>([\s\S]*?)</div>\s*(?:</div>|</li>|$)',
                mod_html,
                re.IGNORECASE,
            )
            lbl_raw = m_lbl.group(1) if m_lbl else mod_html
            lbl_clean = clean_rich_html(lbl_raw)
            plain_txt = " ".join(re.sub(r'<[^>]+>', ' ', lbl_clean).split())
            if plain_txt:
                modules.append({
                    "id": f"mod-{mod_id}",
                    "name": plain_txt[:80] + ("..." if len(plain_txt) > 80 else ""),
                    "type": "label",
                    "url": "",
                    "files": [],
                    "description": plain_txt,
                    "html": lbl_clean,
                    "dueDate": None,
                })
            continue

        # Chercher le lien principal vers /mod/... en priorité
        m_link = re.search(r'<a[^>]+href=["\']([^"\']*?/mod/[^"\']+)["\'][^>]*>(.*?)</a>', mod_html, re.DOTALL)
        if not m_link:
            m_link = re.search(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', mod_html, re.DOTALL)
        if not m_link:
            continue

        href = m_link.group(1).replace("&amp;", "&")
        raw_name = re.sub(r'<[^>]+>', ' ', m_link.group(2)).strip()
        mod_name = " ".join(raw_name.split())
        if not mod_name:
            continue

        mod_type = "autre"
        if "modtype_resource" in act_class or "mod/resource" in href:
            mod_type = "resource"
        elif "modtype_assign" in act_class or "mod/assign" in href:
            mod_type = "assign"
        elif "modtype_folder" in act_class or "mod/folder" in href:
            mod_type = "folder"
        elif "modtype_page" in act_class or "mod/page" in href:
            mod_type = "page"
        elif "modtype_url" in act_class or "mod/url" in href:
            mod_type = "url"
        elif "modtype_forum" in act_class or "mod/forum" in href:
            mod_type = "forum"
        elif "modtype_quiz" in act_class or "mod/quiz" in href:
            mod_type = "quiz"

        files = []
        if mod_type == "resource":
            ext = "pdf" if "pdf" in mod_name.lower() or "pdf" in mod_html.lower() else "doc"
            files.append({
                "id": f"file-{mod_id}",
                "name": mod_name.replace(" Fichier", "").strip(),
                "url": href,
                "fileType": ext,
            })
        elif mod_type == "folder":
            files.append({
                "id": f"folder-{mod_id}",
                "name": mod_name.replace(" Dossier", "").strip(),
                "url": href,
                "fileType": "zip",
            })

        desc = ""
        desc_html = ""
        m_desc = re.search(r'class=["\'][^"\']*(?:contentafterlink|activity-description|activity-altcontent)[^"\']*["\'][^>]*>([\s\S]*?)</div>', mod_html, re.DOTALL)
        if m_desc:
            desc_html = clean_rich_html(m_desc.group(1))
            desc = " ".join(re.sub(r'<[^>]+>', ' ', m_desc.group(1)).split())

        due_date = None
        m_dates = re.search(r'(?:data-region=["\']activity-dates["\']|class=["\'][^"\']*activity-dates[^"\']*["\'])[^>]*>(.*?)</div>', mod_html, re.DOTALL)
        raw_dates_text = ""
        if m_dates:
            raw_dates_text = re.sub(r'<[^>]+>', ' ', m_dates.group(1)).strip()
        elif desc:
            raw_dates_text = desc

        if raw_dates_text:
            m_due = re.search(r'(?:à rendre|date limite|due|fermeture|échéance|rendre avant)\s*:?\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{1,2}\s+[a-zéû\.]+\s+[0-9]{4}(?:[,\s]+[0-9]{1,2}[h:][0-9]{2})?)', raw_dates_text, re.IGNORECASE)
            if m_due:
                due_date = m_due.group(1).strip()
            elif mod_type == "assign" and len(raw_dates_text) < 80 and any(c.isdigit() for c in raw_dates_text):
                due_date = raw_dates_text.strip()

        modules.append({
            "id": f"mod-{mod_id}",
            "name": mod_name,
            "type": mod_type,
            "url": href,
            "files": files,
            "description": desc or None,
            "html": desc_html or None,
            "dueDate": due_date,
        })

    return modules


def extract_section_summary(sec_html):
    """Extrait le résumé / consignes HTML d'une section avant la liste d'activités."""
    before_ul = re.split(r'<ul[^>]+class=["\'][^"\']*section\b', sec_html, maxsplit=1)[0]
    m_sum = re.search(
        r'<div[^>]+class=["\'][^"\']*(?:summarytext|course-description-item)[^"\']*["\'][^>]*>([\s\S]*?)</div>\s*(?:<div[^>]+class=["\'][^"\']*(?:section-summary-activities|divider)|<ul|$)',
        before_ul,
        re.IGNORECASE,
    )
    if not m_sum:
        m_sum = re.search(r'<div[^>]+class=["\'][^"\']*summarytext[^"\']*["\'][^>]*>([\s\S]*?)</div>', before_ul, re.IGNORECASE)
    if not m_sum:
        return None
    cleaned = clean_rich_html(m_sum.group(1))
    plain = " ".join(re.sub(r'<[^>]+>', ' ', cleaned).split())
    return cleaned if plain else None


def parse_sections_from_html(html_text):
    """Découpe les sections visibles dans une page de cours Moodle."""
    sections = []
    sec_parts = re.split(r'<(?:li|section|div)[^>]+id=["\']section-(\d+)["\']', html_text)
    if len(sec_parts) > 1:
        for i in range(1, len(sec_parts), 2):
            sec_num = sec_parts[i]
            sec_html = sec_parts[i + 1]
            m_title = re.search(r'<(?:h3|h4)[^>]*class=["\'][^"\']*sectionname[^"\']*["\'][^>]*>(.*?)</(?:h3|h4)>', sec_html, re.DOTALL)
            sec_title = f"Section {sec_num}"
            if m_title:
                clean_title = re.sub(r'<[^>]+>', ' ', m_title.group(1)).strip()
                sec_title = " ".join(clean_title.split()) if clean_title else f"Section {sec_num}"
            summary_html = extract_section_summary(sec_html)
            modules = parse_modules_from_html(sec_html)
            if modules or summary_html:
                sections.append({
                    "id": f"sec-{sec_num}",
                    "num": str(sec_num),
                    "name": sec_title,
                    "summaryHtml": summary_html,
                    "modules": modules,
                })
    return sections


def detect_tile_or_section_urls(html_text, cid, course_url):
    """Détecte les tuiles (format_tiles) ou sections paginées à récupérer séparément (sans doublons)."""
    targets = {}  # sec_num -> (url, title)
    true_id_to_sec = {}

    # 1. Format Tiles : <li ... id="tile-1" data-section="1" data-true-sectionid="122292">...</li>
    for m in re.finditer(r'<li[^>]+id=["\']tile-(\d+)["\'][^>]*>(.*?)</li>', html_text, re.DOTALL):
        li_open_end = m.group(0).find(">")
        li_open = m.group(0)[:li_open_end] if li_open_end != -1 else m.group(0)
        sec_num = m.group(1)
        if not sec_num or sec_num == "0":
            continue
        tile_html = m.group(2)

        m_true = re.search(r'data-true-sectionid=["\'](\d+)["\']', li_open)
        if m_true:
            true_id_to_sec[m_true.group(1)] = sec_num

        m_href = re.search(r'href=["\']([^"\']+)["\']', tile_html)
        sec_url = m_href.group(1).replace("&amp;", "&") if m_href else f"{ECAMPUS_BASE}/course/view.php?id={cid}&section={sec_num}"

        m_aria = re.search(r'aria-label=["\']([^",]+)', tile_html)
        m_h = re.search(r'<h[234][^>]*>(.*?)</h[234]>', tile_html, re.DOTALL)
        tile_title = (
            m_aria.group(1).strip()
            if m_aria
            else (" ".join(re.sub(r'<[^>]+>', ' ', m_h.group(1)).split()) if m_h else f"Section {sec_num}")
        )
        targets[str(sec_num)] = (sec_url, tile_title)

    # 2. Liens explicites &section=X (si pas déjà couverts par une tuile)
    for m in re.finditer(r'href=["\']([^"\']*course/view\.php\?id=' + str(cid) + r'&(?:amp;)?section=(\d+)[^"\']*)["\']', html_text):
        sec_url = m.group(1).replace("&amp;", "&")
        sec_num = m.group(2)
        if sec_num != "0" and sec_num not in targets:
            targets[sec_num] = (sec_url, f"Section {sec_num}")

    return targets


def scrape_course_details(session, course_item, download_files=False):
    """
    Scrape le contenu d'un cours avec délai de politesse.
    Extrait les sections, modules, fichiers (PDFs, liens, devoirs) y compris format Tuiles.
    """
    cid = course_item["id"]
    fullname = course_item.get("fullname", "")
    shortname = course_item.get("shortname", "")
    course_url = course_item.get("viewurl") or f"{ECAMPUS_BASE}/course/view.php?id={cid}"
    if "lang=" not in course_url:
        course_url += ("&" if "?" in course_url else "?") + "lang=fr"
    res_code = extract_resource_code(fullname) or extract_resource_code(shortname)

    print(f"[*] Récupération du cours {cid} : {fullname} (Code: {res_code or 'Général'})...")

    # Délai aléatoire de politesse (1.0s à 1.8s) pour ne pas être banni
    time.sleep(random.uniform(1.0, 1.8))

    r = session.get(course_url, timeout=15)
    if r.status_code != 200:
        print(f"[-] Erreur HTTP {r.status_code} sur le cours {cid}")
        return {
            "id": cid,
            "moodleId": cid,
            "shortname": shortname,
            "fullname": fullname,
            "resourceCode": res_code,
            "url": course_url,
            "sections": [],
            "lastSyncedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    # Découpage robuste des sections Moodle par séparateur id="section-X"
    sections = parse_sections_from_html(r.text)
    loaded_nums = {s["num"] for s in sections}

    # Si le cours utilise le format Tuiles (format_tiles) ou sections séparées, charger chaque tuile
    extra_targets = detect_tile_or_section_urls(r.text, cid, course_url)
    for sec_key, (sec_url, fallback_title) in extra_targets.items():
        if sec_key in loaded_nums:
            continue
        try:
            time.sleep(random.uniform(0.35, 0.7))
            r_sec = session.get(sec_url, timeout=15)
            if r_sec.status_code != 200:
                continue
            # Charger la tuile ; si elle contient des sous-sections (mod_subsection), les préfixer en sec-sub-{tuile}-{num}
            m_tile_title = re.search(r'<(?:h3|h4)[^>]*class=["\'][^"\']*sectionname[^"\']*["\'][^>]*>(.*?)</(?:h3|h4)>', r_sec.text, re.DOTALL)
            tile_name = fallback_title
            if m_tile_title:
                cleaned = " ".join(re.sub(r'<[^>]+>', ' ', m_tile_title.group(1)).split())
                if cleaned and not cleaned.startswith("Section "):
                    tile_name = cleaned

            sub_sections = parse_sections_from_html(r_sec.text)
            sub_sections = [ss for ss in sub_sections if not (ss["num"] == "0" and "0" in loaded_nums)]

            if len(sub_sections) > 1:
                first = sub_sections[0]
                first["id"] = f"sec-{sec_key}"
                first["name"] = tile_name if first["name"].startswith("Section ") else first["name"]
                sections.append(first)
                loaded_nums.add(str(sec_key))
                for ss in sub_sections[1:]:
                    ss["id"] = f"sec-sub-{sec_key}-{ss['num']}"
                    sections.append(ss)
            else:
                mods = parse_modules_from_html(r_sec.text)
                if mods:
                    sections.append({
                        "id": f"sec-{sec_key}",
                        "num": str(sec_key),
                        "name": tile_name,
                        "modules": mods,
                    })
                    loaded_nums.add(str(sec_key))
        except Exception as e:
            print(f"[-] Erreur lecture tuile/section {sec_key} du cours {cid}: {e}")

    for s in sections:
        s.pop("num", None)

    return {
        "id": cid,
        "moodleId": cid,
        "shortname": shortname,
        "fullname": fullname,
        "resourceCode": res_code,
        "url": course_url,
        "sections": sections,
        "lastSyncedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

def main():
    parser = argparse.ArgumentParser(description="Scraper Anti-Ban Moodle Unicaen")
    parser.add_argument("--force-login", action="store_true", help="Force la reconnexion CAS")
    parser.add_argument("--download-files", action="store_true", help="Télécharge localement les fichiers")
    args = parser.parse_args()

    print("=== Démarrage du Scraper Moodle Unicaen (Anti-Ban) ===")
    session = create_base_session()
    sesskey = None

    if not args.force_login:
        valid, cached_sesskey = load_cached_session(session)
        if valid:
            sesskey = cached_sesskey

    if not sesskey:
        user, pwd, totp_secret, grid_raw, preferred_method = get_credentials()
        sesskey = login_cas(session, user, pwd, totp_secret=totp_secret, grid=grid_raw, preferred_method=preferred_method)

    if not sesskey:
        r_test = session.get(f"{ECAMPUS_BASE}/my/")
        m_sess = re.search(r'["\']sesskey["\']:\s*["\']([^"\']+)["\']', r_test.text)
        sesskey = m_sess.group(1) if m_sess else ""

    print(f"[+] Sesskey Moodle actif : {sesskey}")

    print("[*] Récupération de la liste des cours inscrits...")
    raw_courses = fetch_enrolled_courses(session, sesskey)
    print(f"[+] {len(raw_courses)} cours trouvés sur Moodle.")

    all_courses = []
    total_docs = 0

    for idx, c in enumerate(raw_courses, 1):
        print(f"[{idx}/{len(raw_courses)}] Traitement : {c.get('fullname')}")
        try:
            details = scrape_course_details(session, c, download_files=args.download_files)
            all_courses.append(details)
            doc_count = sum(len(m.get("files", [])) for s in details.get("sections", []) for m in s.get("modules", []))
            total_docs += doc_count
        except Exception as e:
            print(f"[-] Erreur sur le cours {c.get('id')} : {e}")
            time.sleep(2)

    output_data = {
        "lastSyncedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "coursesCount": len(all_courses),
        "totalDocuments": total_docs,
        "courses": all_courses,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n[+] Succès ! {len(all_courses)} cours et {total_docs} documents enregistrés dans {OUTPUT_FILE}")
    print(json.dumps({
        "status": "success",
        "coursesCount": len(all_courses),
        "totalDocuments": total_docs,
        "lastSyncedAt": output_data["lastSyncedAt"]
    }))

if __name__ == "__main__":
    main()
