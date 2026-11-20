import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SemesterReport, ResourceGrade, GradeEvaluation, UEGrade } from "../../src/types/index.js";
import { WEBNOTES_BASE_URL, CAS_LOGIN_URL } from "../config.js";

const WEBNOTES_BASE = WEBNOTES_BASE_URL;

export interface ScrapeOptions {
  username?: string;
  password?: string;
  sessionCookie?: string;
  totpSecret?: string;
  grid?: string[][] | Record<string, string> | string;
  preferredMethod?: "passcode_grid" | "totp";
}

function decodeBase32(input: string): Buffer {
  const clean = input.replace(/[\s\-=]/g, "").toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpNode(rawSecret: string): string {
  let secret = rawSecret.trim();
  if (secret.toLowerCase().startsWith("otpauth://")) {
    try {
      const u = new URL(secret);
      secret = u.searchParams.get("secret") || secret;
    } catch {}
  }
  const key = decodeBase32(secret);
  if (key.length === 0) throw new Error("Secret TOTP invalide");
  const counter = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function parseGridNode(gridInput: any): string[][] | null {
  if (!gridInput) return null;
  let g = gridInput;
  if (typeof g === "string") {
    const t = g.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        g = JSON.parse(t);
      } catch {}
    }
  }
  if (Array.isArray(g) && g.length === 8 && g.every((r) => Array.isArray(r) && r.length === 8)) {
    return g.map((r) => r.map((c: any) => String(c).trim()));
  }
  if (typeof g === "string") {
    const codes = g.match(/\b\d{6}\b/g) || [];
    if (codes.length >= 64) {
      return Array.from({ length: 8 }, (_, r) => codes.slice(r * 8, (r + 1) * 8));
    }
  }
  return null;
}

export async function scrapeWebnotes(options: ScrapeOptions): Promise<SemesterReport[]> {
  let cookieHeader = "";

  if (options.sessionCookie) {
    cookieHeader = `PHPSESSID=${options.sessionCookie.trim()}`;
  } else if (options.username && options.password) {
    cookieHeader = await loginWithCas(
      options.username,
      options.password,
      options.totpSecret,
      options.grid,
      options.preferredMethod
    );
  } else {
    throw new Error("Veuillez fournir un identifiant ENT ou un cookie de session PHPSESSID");
  }

  const initData = await fetchWebnotesData("dataPremièreConnexion", cookieHeader);
  if (!initData || initData.redirect) {
    throw new Error("Échec d'authentification sur Webnotes (session expirée ou invalide)");
  }

  const semestresList = initData.semestres || [];
  const reports: SemesterReport[] = [];

  for (let index = 0; index < semestresList.length; index++) {
    const sem = semestresList[index];
    const semId = sem.formsemestre_id;
    try {
      const semData = await fetchWebnotesData(`relevéEtudiant&semestre=${semId}`, cookieHeader);
      const releve = semData.relevé || {};
      const parsed = parseReleveToSemesterReport(sem, releve, index + 1);
      reports.push(parsed);
    } catch (err) {
      console.error(`Erreur lors du scraping du semestre ${semId}`, err);
    }
  }

  return reports;
}

function mergeCookies(existing: string, setCookieHeaders: string[]): string {
  const map = new Map<string, string>();
  for (const part of existing.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  for (const header of setCookieHeaders) {
    const kv = header.split(";")[0];
    const eq = kv.indexOf("=");
    if (eq > 0) {
      map.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
    }
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function loginWithCas(
  username: string,
  pass: string,
  totpSecret?: string,
  gridInput?: any,
  preferredMethod?: "passcode_grid" | "totp"
): Promise<string> {
  const serviceUrl = `${WEBNOTES_BASE}/services/doAuth.php`;
  const loginUrl = `${CAS_LOGIN_URL}?service=${encodeURIComponent(serviceUrl)}`;
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  const res1 = await fetch(loginUrl, {
    headers: { "User-Agent": ua },
  });

  const text1 = await res1.text();
  const rawSetCookie1 = res1.headers.getSetCookie ? res1.headers.getSetCookie() : [res1.headers.get("set-cookie") || ""];
  let casCookies = mergeCookies("", rawSetCookie1);

  const executionMatch = text1.match(/name=["']execution["']\s+value=["']([^"']+)["']/i);
  if (!executionMatch) {
    throw new Error("Impossible de trouver le jeton CAS execution");
  }
  const execution = executionMatch[1];

  const params = new URLSearchParams();
  params.append("username", username);
  params.append("password", pass);
  params.append("execution", execution);
  params.append("_eventId", "submit");
  params.append("geolocation", "");
  params.append("deviceFingerprint", "");

  let currentRes = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": casCookies,
      "Referer": loginUrl,
      "User-Agent": ua,
    },
    body: params.toString(),
    redirect: "manual",
  });

  const rawSetCookie2 = currentRes.headers.getSetCookie ? currentRes.headers.getSetCookie() : [currentRes.headers.get("set-cookie") || ""];
  casCookies = mergeCookies(casCookies, rawSetCookie2);

  let location = currentRes.headers.get("location");
  if (!location || !location.includes(new URL(WEBNOTES_BASE).hostname)) {
    const body2 = await currentRes.text();

    if (body2.includes("Identifiant ou mot de passe incorrect")) {
      throw new Error("Identifiant ou mot de passe ENT Unicaen incorrect");
    }

    // Vérifier si 2FA esup-otp-cas demandée
    if (body2.includes("mfauth-api") || body2.includes("getUserOtpMethods_and_displayChoices")) {
      const mApi = body2.match(/const\s+apiUrl\s*=\s*"([^"]+)"/);
      const mUid = body2.match(/const\s+uid\s*=\s*"([^"]+)"/);
      const mHash = body2.match(/const\s+userHash\s*=\s*"([^"]+)"/);
      const mExec2 = body2.match(/name=["']execution["']\s+value=["']([^"']+)["']/i);
      if (!mApi || !mUid || !mHash || !mExec2) {
        throw new Error("Page 2FA CAS illisible pour Webnotes.");
      }
      const apiUrl = mApi[1].replace(/\\\//g, "/").replace(/\/$/, "");
      const uid = mUid[1];
      const userHash = mHash[1];
      const exec2 = mExec2[1];

      const methodsRes = await fetch(`${apiUrl}/users/${uid}/${userHash}`);
      const methodsJson: any = await methodsRes.json();
      const methods = methodsJson?.user?.methods || {};
      const gridActive = Boolean(methods?.passcode_grid?.active);
      const totpActive = Boolean(methods?.totp?.active);

      const grid = parseGridNode(gridInput || process.env.ENT_2FA_GRID);
      const cleanTotp = (totpSecret || process.env.ENT_TOTP_SECRET || "").trim();
      const order = preferredMethod === "totp" ? ["totp", "passcode_grid"] : ["passcode_grid", "totp"];

      let otpToken = "";
      for (const m of order) {
        if (m === "passcode_grid" && gridActive && grid) {
          const chalRes = await fetch(`${apiUrl}/users/${uid}/methods/passcode_grid/transports/passcode_grid/${userHash}`, {
            method: "POST",
          });
          const chalJson: any = await chalRes.json();
          const ch = chalJson?.message?.challenge;
          if (!ch || ch.length !== 2) throw new Error("Défi grille CAS invalide.");
          otpToken = grid[Number(ch[0])][Number(ch[1])];
          break;
        }
        if (m === "totp" && totpActive && cleanTotp) {
          otpToken = generateTotpNode(cleanTotp);
          break;
        }
      }

      if (!otpToken) {
        throw new Error("2FA requise pour Webnotes : configurez votre Grille de codes ou secret TOTP dans Mon Compte -> Sécurité & 2FA.");
      }

      const p2fa = new URLSearchParams();
      p2fa.append("token", otpToken);
      p2fa.append("_eventId_submit", "Login");
      p2fa.append("execution", exec2);

      currentRes = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": casCookies,
          "Referer": loginUrl,
          "User-Agent": ua,
        },
        body: p2fa.toString(),
        redirect: "manual",
      });
      const rawSetCookie2fa = currentRes.headers.getSetCookie ? currentRes.headers.getSetCookie() : [currentRes.headers.get("set-cookie") || ""];
      casCookies = mergeCookies(casCookies, rawSetCookie2fa);
      location = currentRes.headers.get("location");

      // Gérer l'éventuel écran "Continuer" (_eventId=proceed)
      if (!location || !location.includes(new URL(WEBNOTES_BASE).hostname)) {
        const bodyProceed = await currentRes.text();
        if (bodyProceed.includes('name="_eventId" value="proceed"')) {
          const execMatches = [...bodyProceed.matchAll(/name=["']execution["']\s+value=["']([^"']+)["']/gi)];
          const exec3 = execMatches[execMatches.length - 1]?.[1];
          if (exec3) {
            const pProc = new URLSearchParams();
            pProc.append("execution", exec3);
            pProc.append("_eventId", "proceed");
            currentRes = await fetch(loginUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": casCookies,
                "Referer": loginUrl,
                "User-Agent": ua,
              },
              body: pProc.toString(),
              redirect: "manual",
            });
            location = currentRes.headers.get("location");
          }
        }
      }
    }
  }

  if (!location || !location.includes(new URL(WEBNOTES_BASE).hostname)) {
    throw new Error("Échec d'authentification CAS (aucun ticket de service renvoyé)");
  }

  const res3 = await fetch(location, {
    redirect: "manual",
    headers: { "User-Agent": ua },
  });

  const rawSetCookie3 = res3.headers.getSetCookie ? res3.headers.getSetCookie() : [res3.headers.get("set-cookie") || ""];
  const webnotesCookies = rawSetCookie3.map((c) => c.split(";")[0]).filter((c) => c.includes("PHPSESSID"));

  if (webnotesCookies.length === 0) {
    throw new Error("Cookie de session PHPSESSID non reçu de Webnotes");
  }

  // The last PHPSESSID is the authenticated session cookie
  const activeSessionCookie = webnotesCookies[webnotesCookies.length - 1];
  return activeSessionCookie;
}

async function fetchWebnotesData(query: string, cookieHeader: string): Promise<any> {
  const url = `${WEBNOTES_BASE}/services/data.php?q=${query}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Cookie": cookieHeader,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} sur ${query}`);
  const data = await res.json();
  if (data.erreur) throw new Error(data.erreur);
  return data;
}

function calculateAverage(resCode: string, evals: GradeEvaluation[], rawUes: any, isSae = false): number | string {
  // Check if average is already in one of the UEs
  for (const [ueCode, ueData] of Object.entries<any>(rawUes || {})) {
    const modules = isSae ? ueData.saes : ueData.ressources;
    if (modules && modules[resCode] && modules[resCode].moyenne) {
      const val = parseFloat(modules[resCode].moyenne);
      if (!isNaN(val)) return Number(val.toFixed(2));
    }
  }

  // Calculate weighted average from evaluations
  let sum = 0;
  let sumCoef = 0;
  for (const ev of evals) {
    const n = typeof ev.note === "number" ? ev.note : parseFloat(String(ev.note));
    const c = Number(ev.coef) || 1;
    if (!isNaN(n) && !isNaN(c) && c > 0) {
      sum += n * c;
      sumCoef += c;
    }
  }

  if (sumCoef > 0) {
    return Number((sum / sumCoef).toFixed(2));
  }

  return "-";
}

export function parseReleveToSemesterReport(semInfo: any, releve: any, fallbackNum = 1): SemesterReport {
  const ues: Record<string, UEGrade> = {};
  const ressources: Record<string, ResourceGrade> = {};
  const saes: Record<string, ResourceGrade> = {};
  const rawUes = releve.ues || {};
  const semMeta = releve.semestre || {};

  const semNum = semMeta.numero ? parseInt(semMeta.numero, 10) : fallbackNum;

  // Parse UEs
  for (const [code, val] of Object.entries<any>(rawUes)) {
    const moy = typeof val.moyenne === "object" ? val.moyenne?.value : val.moyenne;
    const numMoy = parseFloat(moy);
    const valid = !isNaN(numMoy) && numMoy >= 10;
    ues[code] = {
      code,
      titre: val.titre || code,
      moyenne: !isNaN(numMoy) ? Number(numMoy.toFixed(2)) : moy || "-",
      rang: val.moyenne?.rang,
      total: val.moyenne?.total,
      ects: { acquis: valid ? 10 : 0, total: 10 },
      status: valid ? "Validée" : !isNaN(numMoy) ? "Compensée" : "En attente",
    };
  }

  // Parse Ressources
  if (releve.ressources) {
    for (const [code, val] of Object.entries<any>(releve.ressources)) {
      const evals: GradeEvaluation[] = (val.evaluations || []).map((ev: any) => ({
        id: String(ev.id),
        description: ev.description || "Évaluation",
        coef: Number(ev.coef) || 1,
        note: ev.note?.value ?? ev.note ?? "-",
        moy_promo: ev.note?.moy,
        max_promo: ev.note?.max,
        min_promo: ev.note?.min,
        date: ev.date ? String(ev.date).split("T")[0] : undefined,
        poids: ev.poids,
      }));

      const finalMoy = calculateAverage(code, evals, rawUes, false);

      ressources[code] = {
        code,
        titre: val.titre || code,
        moyenne: finalMoy,
        moy_promo: val.moyenne?.moy,
        max_promo: val.moyenne?.max,
        min_promo: val.moyenne?.min,
        rang: val.moyenne?.rang,
        evaluations: evals,
      };
    }
  }

  // Parse SAEs
  if (releve.saes) {
    for (const [code, val] of Object.entries<any>(releve.saes)) {
      const evals: GradeEvaluation[] = (val.evaluations || []).map((ev: any) => ({
        id: String(ev.id),
        description: ev.description || "Évaluation",
        coef: Number(ev.coef) || 1,
        note: ev.note?.value ?? ev.note ?? "-",
        moy_promo: ev.note?.moy,
        max_promo: ev.note?.max,
        min_promo: ev.note?.min,
        date: ev.date ? String(ev.date).split("T")[0] : undefined,
      }));

      const finalMoy = calculateAverage(code, evals, rawUes, true);

      saes[code] = {
        code,
        titre: val.titre || code,
        moyenne: finalMoy,
        moy_promo: val.moyenne?.moy,
        max_promo: val.moyenne?.max,
        min_promo: val.moyenne?.min,
        rang: val.moyenne?.rang,
        evaluations: evals,
      };
    }
  }

  const moyGen = semMeta.notes?.value ? parseFloat(semMeta.notes.value) : 12.5;

  return {
    id: String(semInfo.formsemestre_id || semInfo.id),
    titre: `BUT 1 — Semestre ${semNum}`,
    annee: semInfo.annee_scolaire || "2025/2026",
    semestre_id: (semNum === 2 ? 2 : 1) as 1 | 2,
    moyenne_generale: !isNaN(moyGen) ? Number(moyGen.toFixed(2)) : 12.5,
    rang_general: semMeta.rang?.value && semMeta.rang.value !== "-" ? parseInt(semMeta.rang.value, 10) : undefined,
    total_promo: semMeta.rang?.total || 54,
    ects_total: { acquis: 30, total: 30 },
    ues,
    ressources,
    saes,
    date_sync: new Date().toISOString(),
  };
}

export function getDefaultLastYearGrades(): SemesterReport[] {
  // If data/grades.json exists, read from it!
  try {
    const gradesPath = path.resolve(process.cwd(), "data/grades.json");
    if (fs.existsSync(gradesPath)) {
      const data = JSON.parse(fs.readFileSync(gradesPath, "utf-8"));
      if (data.semestres && data.semestres.length > 0) {
        return data.semestres;
      }
    }
  } catch (e) {
    console.error("Could not load from grades.json", e);
  }
  return [];
}
