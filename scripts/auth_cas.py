#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script d'authentification CAS Unicaen (cas.unicaen.fr) avec Bridge 2FA (Grille + TOTP).
Supporte la connexion initiale et la finalisation du défi 2FA.
"""

import json
import os
import sys
import requests

# Permettre l'import de cas_bridge depuis le même dossier
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from cas_bridge import (
    DEFAULT_CAS_LOGIN_URL,
    extract_student_name,
    generate_totp,
    login_cas_with_bridge,
    normalize_totp_secret,
    parse_grid_input,
    resolve_grid_code,
    restore_cookies,
    serialize_cookies,
    submit_2fa_code,
)

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")


def create_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    })
    return s


def verify_credentials(
    username: str,
    password: str,
    totp_secret: str | None = None,
    grid=None,
    otp_code: str | None = None,
    preferred_method: str | None = None,
):
    s = create_session()
    cas_base = DEFAULT_CAS_LOGIN_URL
    service = os.environ.get("CAS_SERVICE_URL", "https://ecampus-vert.unicaen.fr/login/index.php?authCAS=CAS")

    try:
        res = login_cas_with_bridge(
            session=s,
            service_url=service,
            username=username,
            password=password,
            totp_secret=totp_secret,
            grid=grid,
            otp_code=otp_code,
            preferred_method=preferred_method,
            cas_base=cas_base,
        )

        if res.get("success"):
            return {
                "success": True,
                "username": username,
                "name": res.get("name") or username,
                "department": "BUT Réseaux & Télécoms - Campus 3",
                "method": res.get("method"),
                "casCookies": serialize_cookies(s),
            }

        if res.get("requires2FA"):
            return {
                "success": False,
                "requires2FA": True,
                "methods": res.get("methods", []),
                "gridCell": res.get("gridCell"),
                "challenge": res.get("challenge"),
            }

        return {"success": False, "error": res.get("error", "Échec de l'authentification CAS.")}

    except requests.exceptions.Timeout:
        return {"success": False, "error": "Le serveur CAS Unicaen ne répond pas (délai dépassé)."}
    except Exception as e:
        return {"success": False, "error": f"Erreur de connexion : {str(e)}"}


def verify_2fa_challenge(
    username: str,
    challenge: dict,
    method: str,
    code: str | None = None,
    totp_secret: str | None = None,
    grid=None,
):
    s = create_session()
    restore_cookies(s, challenge.get("cookies", []))

    login_url = challenge["loginUrl"]
    cas_base = challenge.get("casBase", DEFAULT_CAS_LOGIN_URL)
    execution = challenge["execution"]

    try:
        final_code = (code or "").strip()

        if not final_code:
            if method == "totp" and totp_secret:
                final_code = generate_totp(normalize_totp_secret(totp_secret))
            elif method == "passcode_grid" and grid:
                gc = challenge.get("gridCell")
                if not gc:
                    return {"success": False, "error": "Coordonnées de grille introuvables dans le défi."}
                parsed = parse_grid_input(grid)
                final_code = resolve_grid_code(parsed, int(gc["rowIndex"]), int(gc["colIndex"]))

        if not final_code:
            return {"success": False, "error": "Code 2FA à 6 chiffres requis."}

        res = submit_2fa_code(s, login_url, execution, final_code, cas_base)
        if not res.get("success"):
            return {"success": False, "error": res.get("error", "Code 2FA invalide.")}

        resp = res["response"]
        name = extract_student_name(resp.text, username)
        return {
            "success": True,
            "username": username,
            "name": name,
            "department": "BUT Réseaux & Télécoms - Campus 3",
            "method": method,
            "casCookies": serialize_cookies(s),
        }
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Le serveur CAS Unicaen ne répond pas (délai dépassé)."}
    except Exception as e:
        return {"success": False, "error": f"Erreur validation 2FA : {str(e)}"}


def main():
    input_data = {}
    if len(sys.argv) >= 3:
        input_data = {"action": "login", "username": sys.argv[1], "password": sys.argv[2]}
    else:
        try:
            raw = sys.stdin.read()
            if raw.strip():
                input_data = json.loads(raw)
        except Exception:
            print(json.dumps({"success": False, "error": "Paramètres JSON invalides"}))
            return

    action = input_data.get("action", "login")

    if action == "verify_2fa":
        username = input_data.get("username", "")
        challenge = input_data.get("challenge")
        method = input_data.get("method", "passcode_grid")
        if not challenge:
            print(json.dumps({"success": False, "error": "Défi 2FA manquant"}))
            return
        result = verify_2fa_challenge(
            username=username,
            challenge=challenge,
            method=method,
            code=input_data.get("code"),
            totp_secret=input_data.get("totpSecret"),
            grid=input_data.get("grid"),
        )
        print(json.dumps(result))
        return

    user = input_data.get("username", "")
    pwd = input_data.get("password", "")
    if not user or not pwd:
        print(json.dumps({"success": False, "error": "Identifiant et mot de passe requis"}))
        return

    result = verify_credentials(
        username=user,
        password=pwd,
        totp_secret=input_data.get("totpSecret"),
        grid=input_data.get("grid"),
        otp_code=input_data.get("otpCode"),
        preferred_method=input_data.get("preferredMethod"),
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
