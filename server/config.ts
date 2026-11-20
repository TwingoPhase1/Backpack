/**
 * Configuration centralisée des URLs de services Unicaen.
 * Les valeurs sont lues depuis le .env, avec fallback sur les valeurs par défaut.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charge le .env à la racine du projet si les variables ne sont pas déjà définies
function loadEnvFile() {
  const envFile = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envFile)) return;
  try {
    const content = fs.readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch (e) {
    console.error("[config] Erreur lecture .env :", e);
  }
}

loadEnvFile();

// --- URLs des services ---
export const CAS_LOGIN_URL = process.env.CAS_LOGIN_URL || "https://cas.unicaen.fr/login";
export const CAS_SERVICE_URL = process.env.CAS_SERVICE_URL || "https://ecampus-vert.unicaen.fr/login/index.php?authCAS=CAS";
export const ECAMPUS_BASE_URL = process.env.ECAMPUS_BASE_URL || "https://ecampus-vert.unicaen.fr";
export const WEBNOTES_BASE_URL = process.env.WEBNOTES_BASE_URL || "https://webnotes.unicaen.fr";
export const NEXTCLOUD_WEBDAV_URL = process.env.NEXTCLOUD_WEBDAV_URL || "https://unicloud.unicaen.fr/remote.php/webdav";
export const IMAP_HOST = process.env.IMAP_HOST || "imap.unicaen.fr";
export const IMAP_PORT = parseInt(process.env.IMAP_PORT || "993", 10);
export const CROUS_MENU_URL = process.env.CROUS_MENU_URL || "https://www.crous-normandie.fr/restaurant/restaurant-ifs/";

// --- Ports applicatifs ---
export const PORT = parseInt(process.env.PORT || "3001", 10);
export const PORT_PERF = parseInt(process.env.PORT_PERF || "3002", 10);
