import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db, getUserDb } from "../db.js";
import { authService } from "./authService.js";
import { MoodleCourse, MoodleSyncStatus } from "../../src/types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../");
const SCRIPTS_DIR = path.resolve(ROOT_DIR, "scripts");
const DATA_DIR = path.resolve(ROOT_DIR, "data");
const OUTPUT_FILE = path.resolve(DATA_DIR, "moodle_courses.json");
const SESSION_FILE = path.resolve(DATA_DIR, "moodle_session.json");

let isSyncing = false;
let lastSyncTimestamp = 0;
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000; // Cooldown anti-ban : 5 minutes minimum entre 2 scrapes auto
const MANUAL_SYNC_FLOOR_MS = 30 * 1000; // Plancher anti-spam de 30s sur rafraîchissement manuel

export async function runMoodleScraper(
  forceLogin: boolean = false,
  bypassCooldown: boolean = false
): Promise<MoodleSyncStatus> {
  if (isSyncing) {
    return db.getMoodleSyncStatus();
  }

  // Protection Anti-Ban / Anti-DDoS
  const minInterval = bypassCooldown ? MANUAL_SYNC_FLOOR_MS : MIN_SYNC_INTERVAL_MS;
  if (!forceLogin && Date.now() - lastSyncTimestamp < minInterval) {
    const remainingSec = Math.ceil((minInterval - (Date.now() - lastSyncTimestamp)) / 1000);
    console.log(`[Anti-Ban Moodle] Requête ignorée pour préserver l'ENT (cooldown actif : encore ${remainingSec}s)`);
    return db.getMoodleSyncStatus();
  }

  isSyncing = true;
  lastSyncTimestamp = Date.now();
  db.updateMoodleSyncStatus({ isSyncing: true, lastError: null });

  const scriptPath = path.resolve(SCRIPTS_DIR, "scrape_moodle.py");
  const args = [scriptPath];
  if (forceLogin) {
    args.push("--force-login");
  }

  return new Promise((resolve) => {
    console.log(`[*] Démarrage du scraper Moodle anti-ban : python ${args.join(" ")}`);
    const envVars: NodeJS.ProcessEnv = { ...process.env };
    const activeSessions = authService.getActiveUsersWithCredentials();
    const activeFirst = activeSessions[0];
    if (!envVars.ENT_USER && activeFirst?.username) envVars.ENT_USER = activeFirst.username;
    if (!envVars.ENT_PASS && activeFirst?.password) envVars.ENT_PASS = activeFirst.password;

    const targetUser = envVars.ENT_USER || authService.getAllUsers()[0]?.username;
    if (targetUser) {
      const secrets = authService.getUser2FASecrets(targetUser);
      if (secrets?.totpSecret) envVars.ENT_TOTP_SECRET = secrets.totpSecret;
      if (secrets?.grid) envVars.ENT_2FA_GRID = typeof secrets.grid === "string" ? secrets.grid : JSON.stringify(secrets.grid);
      if (secrets?.preferredMethod) envVars.ENT_2FA_METHOD = secrets.preferredMethod;
    }
    const py = spawn("python", args, { cwd: ROOT_DIR, env: envVars });

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d) => {
      const text = d.toString();
      stdout += text;
      console.log(`[MoodleScraper stdout] ${text.trim()}`);
    });

    py.stderr.on("data", (d) => {
      const text = d.toString();
      stderr += text;
      console.error(`[MoodleScraper stderr] ${text.trim()}`);
    });

    py.on("close", (code) => {
      isSyncing = false;
      if (code === 0) {
        try {
          if (fs.existsSync(OUTPUT_FILE)) {
            const raw = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
            const courses: MoodleCourse[] = raw.courses || [];
            db.updateMoodleCourses(courses);

            const status: MoodleSyncStatus = {
              lastSyncedAt: raw.lastSyncedAt || new Date().toISOString(),
              coursesCount: courses.length,
              totalDocuments: raw.totalDocuments || 0,
              isSyncing: false,
              lastError: null,
            };
            db.updateMoodleSyncStatus(status);

            // Propager aussi aux bases utilisateurs actives et connues
            const updatedUsers = new Set<string>();
            for (const active of authService.getActiveUsersWithCredentials()) {
              updatedUsers.add(active.username);
              const userDb = getUserDb(active.username);
              userDb.updateMoodleCourses(courses);
              userDb.updateMoodleSyncStatus(status);
            }
            for (const u of authService.getAllUsers()) {
              if (updatedUsers.has(u.username)) continue;
              const userDb = getUserDb(u.username);
              userDb.updateMoodleCourses(courses);
              userDb.updateMoodleSyncStatus(status);
            }
            console.log(`[+] Synchronisation Moodle réussie ! ${courses.length} cours chargés.`);
            return resolve(status);
          }
        } catch (e: any) {
          console.error("[-] Erreur de lecture des résultats Moodle :", e);
        }
      }

      if (code !== 0 || (db.getMoodleCourses().length === 0)) {
        lastSyncTimestamp = 0;
      }

      const errMsg = stderr || `Le scraper s'est terminé avec le code ${code}`;
      const errStatus: MoodleSyncStatus = {
        ...db.getMoodleSyncStatus(),
        isSyncing: false,
        lastError: errMsg,
      };
      db.updateMoodleSyncStatus(errStatus);
      resolve(errStatus);
    });
  });
}

export function getMoodleSessionCookies(): Record<string, string> {
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      return raw.cookies || {};
    } catch {}
  }
  return {};
}
