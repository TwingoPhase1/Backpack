#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bridge d'authentification CAS Unicaen avec support 2FA (esup-otp-cas / mfauth-api.unicaen.fr).
Supporte en priorité :
  1. Grille de codes (passcode_grid) — résolution automatique si grille fournie, sinon défi interactif
  2. TOTP (totp) — génération RFC 6238 si secret Base32 fourni, sinon code interactif
Gère également l'écran intermédiaire CAS ("Continuer" / _eventId=proceed).
"""

import base64
import hashlib
import hmac
import json
import os
import re
import struct
import time
from urllib.parse import parse_qs, quote, urlparse

import requests

DEFAULT_CAS_LOGIN_URL = os.environ.get("CAS_LOGIN_URL", "https://cas.unicaen.fr/login")


def normalize_totp_secret(raw_secret: str) -> str:
    """Extrait la clé Base32 depuis un secret brut ou une URI otpauth://."""
    if not raw_secret:
        return ""
    s = raw_secret.strip()
    if s.lower().startswith("otpauth://"):
        parsed = urlparse(s)
        qs = parse_qs(parsed.query)
        if "secret" in qs and qs["secret"]:
            s = qs["secret"][0]
    # Nettoyer espaces, tirets et mettre en majuscules
    s = re.sub(r"[\s\-]", "", s).upper()
    return s


def generate_totp(secret: str, timestamp: float | None = None, step: int = 30, digits: int = 6) -> str:
    """Génère un code TOTP RFC 6238 (HMAC-SHA1) sans dépendance externe."""
    clean = normalize_totp_secret(secret)
    if not clean:
        raise ValueError("Secret TOTP vide ou invalide.")

    # Ajouter le padding '=' requis pour base64.b32decode
    pad_len = (-len(clean)) % 8
    padded = clean + ("=" * pad_len)
    key = base64.b32decode(padded, casefold=True)

    now = timestamp if timestamp is not None else time.time()
    counter = int(now // step)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code_int % (10 ** digits)).zfill(digits)


def parse_grid_input(grid_input) -> list[list[str]] | None:
    """
    Normalise une grille 8x8 depuis :
      - une liste 2D (8x8)
      - un dict {"A1": "272416", ...}
      - une chaîne de texte multi-lignes contenant 64 codes à 6 chiffres
    """
    if not grid_input:
        return None

    if isinstance(grid_input, str):
        stripped = grid_input.strip()
        if stripped.startswith("[") or stripped.startswith("{"):
            try:
                grid_input = json.loads(stripped)
            except Exception:
                pass

    if isinstance(grid_input, list):
        if len(grid_input) == 8 and all(isinstance(row, list) and len(row) == 8 for row in grid_input):
            return [[str(cell).strip() for cell in row] for row in grid_input]

    if isinstance(grid_input, dict):
        rows = []
        for r_idx in range(8):
            row_letter = chr(65 + r_idx)
            row = []
            for c_idx in range(8):
                key = f"{row_letter}{c_idx + 1}"
                val = grid_input.get(key) or grid_input.get(key.lower()) or ""
                row.append(str(val).strip())
            rows.append(row)
        if any(any(c for c in r) for r in rows):
            return rows

    if isinstance(grid_input, str):
        codes = re.findall(r"\b\d{6}\b", grid_input)
        if len(codes) >= 64:
            codes = codes[:64]
            return [codes[i * 8 : (i + 1) * 8] for i in range(8)]

    return None


def resolve_grid_code(grid_input, row_idx: int, col_idx: int) -> str:
    """Récupère le code à 6 chiffres pour [row_idx (0..7), col_idx (0..7)]."""
    grid = parse_grid_input(grid_input)
    if not grid:
        raise ValueError("Grille de codes 8x8 invalide ou absente.")
    if not (0 <= row_idx < 8 and 0 <= col_idx < 8):
        raise ValueError(f"Coordonnées de grille hors limites : ({row_idx}, {col_idx})")
    code = grid[row_idx][col_idx].strip()
    if not code:
        raise ValueError(f"Case {chr(65 + row_idx)}{col_idx + 1} vide dans la grille.")
    return code


def extract_execution_token(html: str) -> str | None:
    m = re.search(r'name=["\']execution["\']\s+value=["\']([^"\']+)["\']', html)
    if m:
        return m.group(1)
    m = re.search(r'value=["\']([^"\']+)["\']\s+name=["\']execution["\']', html)
    return m.group(1) if m else None


def extract_mfauth_context(html: str) -> dict | None:
    """Détecte la page 2FA esup-otp-cas et extrait apiUrl, uid, userHash et execution."""
    if "mfauth-api" not in html and "getUserOtpMethods_and_displayChoices" not in html:
        return None
    m_api = re.search(r'const\s+apiUrl\s*=\s*"([^"]+)"', html)
    m_uid = re.search(r'const\s+uid\s*=\s*"([^"]+)"', html)
    m_hash = re.search(r'const\s+userHash\s*=\s*"([^"]+)"', html)
    execution = extract_execution_token(html)
    if not (m_api and m_uid and m_hash and execution):
        return None
    return {
        "api_url": m_api.group(1).replace(r"\/", "/").rstrip("/"),
        "uid": m_uid.group(1),
        "user_hash": m_hash.group(1),
        "execution": execution,
    }


def extract_student_name(html: str, fallback_username: str) -> str:
    """Extrait le nom complet de l'étudiant depuis la page d'accueil eCampus."""
    patterns = [
        r'class=["\']usertext[^"\']*["\']>([^<]+)<',
        r'aria-label=["\']([^"\']+)["\']\s+role=["\']img["\']',
        r'title=["\']([^"\']+)["\'][^>]*class=["\'][^"\']*userpicture',
    ]
    for pat in patterns:
        m = re.search(pat, html)
        if m:
            candidate = m.group(1).strip()
            if candidate and len(candidate) < 80:
                return candidate
    return fallback_username


def handle_cas_interrupt(session: requests.Session, response: requests.Response, login_url: str) -> requests.Response:
    """Gère l'écran d'avertissement CAS Unicaen ('Continuer' / _eventId=proceed)."""
    if 'name="_eventId" value="proceed"' in response.text or "name='_eventId' value='proceed'" in response.text:
        all_exec = re.findall(r'name=["\']execution["\']\s+value=["\']([^"\']+)["\']', response.text)
        if all_exec:
            r_next = session.post(
                login_url,
                data={"execution": all_exec[-1], "_eventId": "proceed"},
                allow_redirects=True,
                timeout=15,
            )
            return r_next
    return response


def serialize_cookies(session: requests.Session) -> list[dict]:
    return [
        {
            "name": c.name,
            "value": c.value,
            "domain": c.domain,
            "path": c.path,
        }
        for c in session.cookies
    ]


def restore_cookies(session: requests.Session, cookies_list: list[dict]):
    for c in cookies_list or []:
        session.cookies.set(
            c["name"],
            c["value"],
            domain=c.get("domain") or "",
            path=c.get("path") or "/",
        )


def fetch_mfa_methods(session: requests.Session, ctx: dict) -> dict:
    url = f"{ctx['api_url']}/users/{ctx['uid']}/{ctx['user_hash']}"
    r = session.get(url, timeout=10)
    data = r.json()
    if data.get("code") != "Ok":
        raise RuntimeError("Impossible de récupérer les méthodes 2FA depuis mfauth-api.")
    return data.get("user", {}).get("methods", {})


def request_grid_challenge(session: requests.Session, ctx: dict) -> tuple[int, int]:
    url = f"{ctx['api_url']}/users/{ctx['uid']}/methods/passcode_grid/transports/passcode_grid/{ctx['user_hash']}"
    r = session.post(url, timeout=10)
    data = r.json()
    if data.get("code") != "Ok":
        raise RuntimeError("Impossible de demander un défi de grille de codes.")
    challenge = data.get("message", {}).get("challenge")
    if not challenge or len(challenge) != 2:
        raise RuntimeError("Défi de grille de codes invalide.")
    return int(challenge[0]), int(challenge[1])


def submit_2fa_code(
    session: requests.Session,
    login_url: str,
    execution: str,
    code: str,
    cas_base: str = DEFAULT_CAS_LOGIN_URL,
) -> dict:
    """Soumet le code 2FA au CAS et suit les redirections (dont proceed)."""
    r_post = session.post(
        login_url,
        data={
            "token": str(code).strip(),
            "_eventId_submit": "Login",
            "execution": execution,
        },
        allow_redirects=True,
        timeout=15,
    )
    r_post = handle_cas_interrupt(session, r_post, login_url)

    if cas_base in r_post.url:
        # Vérifier s'il s'agit d'une erreur de code
        m_err = re.search(r'id=["\']errors["\'][^>]*>(.*?)</div>', r_post.text, re.DOTALL)
        if not m_err:
            m_err = re.search(r'class=["\'][^"\']*alert-danger[^"\']*["\'][^>]*>(.*?)</div>', r_post.text, re.DOTALL)
        err_msg = "Code 2FA invalide ou expiré."
        if m_err:
            clean = re.sub(r"<[^>]+>", " ", m_err.group(1)).strip()
            if clean:
                err_msg = " ".join(clean.split())
        return {"success": False, "error": err_msg, "response": r_post}

    return {"success": True, "response": r_post}


def login_cas_with_bridge(
    session: requests.Session,
    service_url: str,
    username: str,
    password: str,
    totp_secret: str | None = None,
    grid=None,
    otp_code: str | None = None,
    preferred_method: str | None = None,
    cas_base: str = DEFAULT_CAS_LOGIN_URL,
) -> dict:
    """
    Effectue la connexion CAS Unicaen complète avec résolution 2FA (Grille & TOTP en priorité).
    Retourne un dictionnaire avec:
      - {"success": True, "response": Response, "name": str}
      - ou {"success": False, "requires2FA": True, "challenge": {...}}
      - ou {"success": False, "error": str}
    """
    login_url = f"{cas_base}?service={quote(service_url, safe='')}"
    r_page = session.get(login_url, allow_redirects=True, timeout=12)

    # Si déjà connecté via un TGC valide
    if cas_base not in r_page.url and service_url.split("/")[2] in r_page.url:
        return {
            "success": True,
            "response": r_page,
            "name": extract_student_name(r_page.text, username),
        }

    if r_page.status_code != 200:
        return {"success": False, "error": f"Erreur d'accès au CAS Unicaen (HTTP {r_page.status_code})"}

    ex1 = extract_execution_token(r_page.text)
    if not ex1:
        return {"success": False, "error": "Impossible d'extraire le jeton de sécurité CAS."}

    r_post = session.post(
        login_url,
        data={
            "username": username,
            "password": password,
            "execution": ex1,
            "_eventId": "submit",
            "geolocation": "",
            "deviceFingerprint": "",
        },
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": login_url,
        },
        allow_redirects=True,
        timeout=15,
    )

    # Écran intermédiaire éventuel sans 2FA
    r_post = handle_cas_interrupt(session, r_post, login_url)

    # Connexion directe réussie sans 2FA
    if cas_base not in r_post.url:
        return {
            "success": True,
            "response": r_post,
            "name": extract_student_name(r_post.text, username),
        }

    # Vérifier si la page demande la 2FA (esup-otp-cas)
    ctx = extract_mfauth_context(r_post.text)
    if not ctx:
        m_err = re.search(r'class=["\'](?:alert alert-danger|errors)["\'][^>]*>(.*?)</div>', r_post.text, re.DOTALL)
        err_text = "Identifiant ou mot de passe ENT incorrect."
        if m_err:
            clean_err = re.sub(r"<[^>]+>", " ", m_err.group(1)).strip()
            if clean_err:
                err_text = " ".join(clean_err.split())
        return {"success": False, "error": err_text}

    # Récupérer les méthodes 2FA actives
    methods_info = fetch_mfa_methods(session, ctx)
    grid_active = bool(methods_info.get("passcode_grid", {}).get("active"))
    totp_active = bool(methods_info.get("totp", {}).get("active"))

    available_methods = []
    if grid_active:
        available_methods.append("passcode_grid")
    if totp_active:
        available_methods.append("totp")

    parsed_grid = parse_grid_input(grid)
    clean_totp = normalize_totp_secret(totp_secret or "")

    # Déterminer l'ordre de priorité : Grille et TOTP
    order = []
    if preferred_method == "totp":
        order = ["totp", "passcode_grid"]
    else:
        order = ["passcode_grid", "totp"]

    resolved_code = None
    used_method = None

    for m in order:
        if m == "passcode_grid" and grid_active and parsed_grid:
            row_idx, col_idx = request_grid_challenge(session, ctx)
            resolved_code = resolve_grid_code(parsed_grid, row_idx, col_idx)
            used_method = "passcode_grid"
            break
        if m == "totp" and totp_active and clean_totp:
            resolved_code = generate_totp(clean_totp)
            used_method = "totp"
            break

    # Si un code ponctuel a été passé directement
    if not resolved_code and otp_code:
        resolved_code = str(otp_code).strip()
        used_method = preferred_method or ("totp" if totp_active else "passcode_grid")

    if resolved_code:
        res_2fa = submit_2fa_code(session, login_url, ctx["execution"], resolved_code, cas_base)
        if not res_2fa.get("success"):
            return {"success": False, "error": res_2fa.get("error", "Échec validation 2FA.")}
        final_resp = res_2fa["response"]
        return {
            "success": True,
            "response": final_resp,
            "name": extract_student_name(final_resp.text, username),
            "method": used_method,
        }

    # Sinon : aucune méthode automatique configurée -> demander au front-end (défi interactif)
    grid_cell = None
    if grid_active:
        row_idx, col_idx = request_grid_challenge(session, ctx)
        grid_cell = {
            "row": chr(65 + row_idx),
            "col": col_idx + 1,
            "rowIndex": row_idx,
            "colIndex": col_idx,
            "label": f"{chr(65 + row_idx)}{col_idx + 1}",
        }

    return {
        "success": False,
        "requires2FA": True,
        "methods": available_methods,
        "gridCell": grid_cell,
        "challenge": {
            "loginUrl": login_url,
            "casBase": cas_base,
            "execution": ctx["execution"],
            "apiUrl": ctx["api_url"],
            "uid": ctx["uid"],
            "userHash": ctx["user_hash"],
            "cookies": serialize_cookies(session),
            "gridCell": grid_cell,
            "methods": available_methods,
        },
    }
