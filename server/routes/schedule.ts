import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "../db.js";
import { ScheduleEvent } from "../../src/types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const COLOR_MAP: Record<string, string> = {
  "1": "#818cf8", // SAE
  "2": "#34d399",
  "3": "#a855f7",
  "4": "#f472b6",
  "5": "#fbbf24",
  "6": "#fb923c",
  "7": "#06b6d4", // TP
  "8": "#94a3b8", // Autre
  "9": "#3b82f6", // CM / TD
  "10": "#22c55e",
  "11": "#ef4444", // Examen
};

/**
 * Convertit une date ICS (ex: 20260824T080000 en Europe/Paris ou ...Z) en ISO 8601 avec fuseau horaire exact.
 */
function parseIcsDateToIso(rawProp: string, value: string): string | null {
  const val = value.trim();
  if (!val) return null;

  // Format UTC: 20260824T080000Z
  const mUtc = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (mUtc) {
    return `${mUtc[1]}-${mUtc[2]}-${mUtc[3]}T${mUtc[4]}:${mUtc[5]}:${mUtc[6]}Z`;
  }

  // Format local (ex: TZID="Europe/Paris":20260824T080000)
  const mLocal = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (mLocal) {
    const [, y, mo, d, h, mi, s] = mLocal;
    // Calculer le décalage exact Europe/Paris pour cette date (CET +01:00 ou CEST +02:00)
    const approxUtc = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    const parisStr = approxUtc.toLocaleString("en-US", {
      timeZone: "Europe/Paris",
      timeZoneName: "shortOffset",
    });
    const offsetMatch = parisStr.match(/GMT([+-]\d+(?::\d+)?)/);
    let offset = "+01:00";
    if (offsetMatch) {
      const rawOff = offsetMatch[1];
      if (rawOff.includes(":")) {
        const [oh, om] = rawOff.split(":");
        offset = `${oh[0]}${oh.slice(1).padStart(2, "0")}:${om.padStart(2, "0")}`;
      } else {
        offset = `${rawOff[0]}${rawOff.slice(1).padStart(2, "0")}:00`;
      }
    }
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
  }

  // Format journée entière: 20260824
  const mDay = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (mDay) {
    return `${mDay[1]}-${mDay[2]}-${mDay[3]}T00:00:00+01:00`;
  }

  return null;
}

function unescapeIcsText(str: string): string {
  return str
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractMatchedCode(summary: string, desc: string): string | undefined {
  const combined = `${summary} ${desc}`;
  const mR = combined.match(/\bR[.\s\-_]?([1-6])[.\s\-_]?(0?[1-9]|1[0-6])\b/i);
  if (mR) {
    return `R${mR[1]}${String(parseInt(mR[2], 10)).padStart(2, "0")}`;
  }
  const mSae = combined.match(/\bSA[EÉ][.\s\-_]?([1-6])[.\s\-_]?(0?[1-6])\b/i);
  if (mSae) {
    return `SAE${mSae[1]}${parseInt(mSae[2], 10)}`;
  }
  return undefined;
}

function parseIcsCalendar(icsText: string): ScheduleEvent[] {
  // Déplier les lignes RFC 5545 (\r\n suivi d'un espace ou tabulation)
  const unfolded = icsText.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const events: ScheduleEvent[] = [];

  for (const block of blocks) {
    const endIdx = block.indexOf("END:VEVENT");
    const content = endIdx >= 0 ? block.slice(0, endIdx) : block;
    const lines = content.split(/\r?\n/);

    let uid = "";
    let summary = "Cours";
    let description = "";
    let location = "IUT";
    let startIso: string | null = null;
    let endIso: string | null = null;

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const prop = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1);
      const propName = prop.split(";")[0].toUpperCase();

      if (propName === "UID") uid = val.trim();
      else if (propName === "SUMMARY") summary = unescapeIcsText(val);
      else if (propName === "DESCRIPTION") description = unescapeIcsText(val);
      else if (propName === "LOCATION") location = unescapeIcsText(val) || "IUT";
      else if (propName === "DTSTART") startIso = parseIcsDateToIso(prop, val);
      else if (propName === "DTEND") endIso = parseIcsDateToIso(prop, val);
    }

    if (!startIso || !endIso) continue;

    let teacher: string | undefined;
    const tMatch = description.match(/(?:Enseignant|Enseignants)\s*:\s*([^\n\r]+)/i);
    if (tMatch) teacher = tMatch[1].trim();

    let group: string | undefined;
    const gMatch = description.match(/(?:Groupe d'étudiants|Groupe|Groupes)\s*:\s*([^\n\r]+)/i);
    if (gMatch) group = gMatch[1].trim();

    let type: ScheduleEvent["type"] = "Autre";
    let colorId = "9";
    const sumUpper = summary.toUpperCase();
    if (sumUpper.includes("EXAMEN") || sumUpper.includes("DS ") || sumUpper.includes("CONTRÔLE") || sumUpper.includes("🚨")) {
      type = "Examen";
      colorId = "11";
    } else if (/\bTP\b/.test(sumUpper) || summary.includes("💻")) {
      type = "TP";
      colorId = "7";
    } else if (/\bTD\b/.test(sumUpper) || summary.includes("✏️")) {
      type = "TD";
      colorId = "9";
    } else if (/\bCM\b/.test(sumUpper) || summary.includes("🎤")) {
      type = "CM";
      colorId = "3";
    } else if (sumUpper.includes("SAÉ") || sumUpper.includes("SAE") || summary.includes("🚀")) {
      type = "SAE";
      colorId = "1";
    }

    events.push({
      id: uid || `evt-${startIso}-${summary.slice(0, 12)}`,
      summary,
      start: startIso,
      end: endIso,
      location,
      description,
      teacher,
      group,
      matchedCode: extractMatchedCode(summary, description),
      type,
      colorId,
      colorHex: COLOR_MAP[colorId] || "#3b82f6",
    });
  }

  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function fetchLiveZimbraSchedule(username: string, password: string): Promise<ScheduleEvent[]> {
  const icsUrl =
    process.env.ICS_URL ||
    "https://webmail.unicaen.fr/service/home/~/Emploi%20du%20temps.ics";

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const res = await fetch(icsUrl, {
    headers: {
      Authorization: authHeader,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Erreur Zimbra ICS HTTP ${res.status} (${res.statusText})`);
  }

  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("Réponse Zimbra invalide (pas un fichier calendrier ICS).");
  }

  return parseIcsCalendar(text);
}

// GET schedule events
router.get("/", (req, res) => {
  const currentDb = req.userDb || db;
  const { start, end, code } = req.query;
  let events = currentDb.getScheduleEvents();

  if (code) {
    events = events.filter((e) => e.matchedCode === code);
  }

  if (start && end) {
    const startTime = new Date(start as string).getTime();
    const endTime = new Date(end as string).getTime();
    events = events.filter((e) => {
      const eStart = new Date(e.start).getTime();
      return eStart >= startTime && eStart <= endTime;
    });
  }

  // Enrichir uniquement les cours marqués en distanciel/visio (via mail ou EDT) avec le lien BigBlueButton Moodle
  const token = req.authToken;
  const isRemoteRegex = /visio|distanciel|à distance|a distance|en ligne|bbb|bigbluebutton|teams|zoom|meet/i;
  const enriched = events.map((ev) => {
    if (ev.visioUrl || !ev.matchedCode) return ev;
    const eventText = `${ev.location || ""} ${ev.summary || ""} ${ev.aiUpdatedReason || ""} ${ev.description || ""}`;
    if (!isRemoteRegex.test(eventText)) return ev;
    const courses = currentDb.getMoodleCoursesForResource(ev.matchedCode);
    const bbbMods: Array<{ name: string; url: string }> = [];
    for (const c of courses) {
      for (const s of c.sections || []) {
        for (const m of s.modules || []) {
          if (m.url && m.url.includes("mod/bigbluebuttonbn")) {
            bbbMods.push({ name: m.name || "", url: m.url });
          }
        }
      }
    }
    if (bbbMods.length === 0) return ev;

    const evType = (ev.type || "").toUpperCase();
    const teacherWords = (ev.teacher || "")
      .toUpperCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    let best = bbbMods[0];
    let bestScore = -1;
    for (const bm of bbbMods) {
      const up = bm.name.toUpperCase();
      let score = 0;
      if (evType && up.includes(evType)) score += 3;
      if (teacherWords.some((w) => up.includes(w))) score += 3;
      if (bbbMods.length === 1) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = bm;
      }
    }

    if (bestScore >= 1) {
      return {
        ...ev,
        visioUrl: `/api/moodle/bbb/redirect?url=${encodeURIComponent(best.url)}${token ? `&token=${encodeURIComponent(token)}` : ""}`,
      };
    }
    return ev;
  });

  res.json(enriched);
});

// GET detected schedule changes & notifications
router.get("/changes", (req, res) => {
  const currentDb = req.userDb || db;
  const changes = currentDb.getScheduleChanges();
  const unreadCount = changes.filter((c) => !c.isRead).length;
  res.json({ changes, unreadCount });
});

// POST mark schedule change as read
router.post("/changes/mark-read", (req, res) => {
  const currentDb = req.userDb || db;
  const { id } = req.body;
  currentDb.markScheduleChangeAsRead(id);
  const changes = currentDb.getScheduleChanges();
  res.json({
    success: true,
    changes,
    unreadCount: changes.filter((c) => !c.isRead).length,
  });
});

// POST sync live from Zimbra ICS Unicaen (or local store fallback)
router.post("/sync", async (req, res) => {
  const currentDb = req.userDb || db;
  const creds = req.credentials;
  const username = creds?.username || process.env.ENT_USER;
  const password = creds?.password || process.env.ENT_PASS;

  if (username && password) {
    try {
      const sorted = await fetchLiveZimbraSchedule(username, password);
      const { changes } = currentDb.setScheduleEvents(sorted);
      return res.json({
        message: "Synchronisation de l'emploi du temps réussie",
        count: sorted.length,
        changesCount: changes.length,
      });
    } catch (err: any) {
      console.error("[-] Erreur synchro Zimbra ICS:", err.message);
      // Si un store local existe encore, tenter le fallback, sinon renvoyer l'erreur claire
      const syncStorePath = path.resolve(__dirname, "../../unicaen-sync/.google_sync_store.json");
      if (!fs.existsSync(syncStorePath)) {
        return res.status(502).json({
          error: `Impossible de synchroniser l'emploi du temps Unicaen : ${err.message}`,
        });
      }
    }
  }

  reloadEventsFromStore(res, currentDb);
});

export function reloadEventsFromStore(res?: any, targetDb?: any): ScheduleEvent[] {
  const syncStorePath = path.resolve(__dirname, "../../unicaen-sync/.google_sync_store.json");
  if (!fs.existsSync(syncStorePath)) {
    if (res) res.status(404).json({ error: "Identifiants de session manquants pour synchroniser l'emploi du temps Zimbra." });
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(syncStorePath, "utf-8"));
    const eventsObj = raw.events || {};
    const result: ScheduleEvent[] = [];

    for (const [id, e] of Object.entries<any>(eventsObj)) {
      if (!e.start?.dateTime || !e.end?.dateTime) continue;

      const summary = e.summary || "Cours";
      const desc = e.description || "";
      const matchedCode = e.extendedProperties?.private?.matchedCode;

      let teacher: string | undefined;
      const tMatch = desc.match(/(?:Enseignant|Enseignants)\s*:\s*([^\n\r]+)/i);
      if (tMatch) teacher = tMatch[1].trim();

      let group: string | undefined;
      const gMatch = desc.match(/(?:Groupe|Groupes)\s*:\s*([^\n\r]+)/i);
      if (gMatch) group = gMatch[1].trim();

      let type: ScheduleEvent["type"] = "Autre";
      if (summary.includes("Examen") || summary.includes("🚨")) type = "Examen";
      else if (summary.includes("TP") || summary.includes("💻")) type = "TP";
      else if (summary.includes("TD") || summary.includes("✏️")) type = "TD";
      else if (summary.includes("CM") || summary.includes("🎤")) type = "CM";
      else if (summary.includes("SAÉ") || summary.includes("SAE") || summary.includes("🚀")) type = "SAE";

      result.push({
        id: e.id || id,
        summary,
        start: e.start.dateTime,
        end: e.end.dateTime,
        location: e.location || "IUT",
        description: desc,
        teacher,
        group,
        matchedCode,
        type,
        colorId: e.colorId,
        colorHex: COLOR_MAP[e.colorId || "7"] || "#3b82f6",
      });
    }

    const activeDb = targetDb || db;
    const sorted = result.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const { changes } = activeDb.setScheduleEvents(sorted);
    if (res) {
      res.json({
        message: "Synchronisation réussie",
        count: sorted.length,
        changesCount: changes.length,
      });
    }
    return sorted;
  } catch (e: any) {
    if (res) {
      res.status(500).json({ error: "Erreur lors de la lecture du sync store: " + e.message });
    }
    return [];
  }
}

export default router;
