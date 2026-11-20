import { db, getUserDb } from "../db.js";
import { authService } from "./authService.js";
import { scrapeWebnotes } from "./webnotesScraper.js";
import { runMoodleScraper } from "./moodleScraper.js";
import { mailService } from "./mailService.js";
import { fetchLiveZimbraSchedule, reloadEventsFromStore } from "../routes/schedule.js";
import { mailService } from "./mailService.js";
import { DetectedNewGrade } from "../../src/types/index.js";
import "../config.js";

const GRADE_SYNC_INTERVAL_MS =
  Math.max(5, Number(process.env.GRADE_SYNC_INTERVAL_MIN || 15)) * 60 * 1000;
const MOODLE_SYNC_EVERY_N_CYCLES = 4; // Toutes les ~60 min si cycle = 15 min

let isSyncRunning = false;
let cycleCount = 0;

export function getNextScheduledSyncTime(): Date {
  return new Date(Date.now() + GRADE_SYNC_INTERVAL_MS);
}

interface SyncTarget {
  username?: string;
  password?: string;
  sessionCookie?: string;
  targetDb: typeof db;
}

function getSyncTargets(): SyncTarget[] {
  const targets: SyncTarget[] = [];
  const seenUsers = new Set<string>();

  for (const active of authService.getActiveUsersWithCredentials()) {
    seenUsers.add(active.username);
    targets.push({
      username: active.username,
      password: active.password,
      targetDb: getUserDb(active.username),
    });
  }

  const envUser = process.env.ENT_USER;
  const envPass = process.env.ENT_PASS;
  const envSession = process.env.WEBNOTES_SESSION;

  if ((envSession || (envUser && envPass)) && (!envUser || !seenUsers.has(envUser))) {
    targets.push({
      username: envUser,
      password: envPass,
      sessionCookie: envSession,
      targetDb: envUser ? getUserDb(envUser) : db,
    });
  }

  return targets;
}

async function syncGradesForTarget(target: SyncTarget): Promise<{
  success: boolean;
  reportsCount: number;
  newlyDetected: DetectedNewGrade[];
  error?: string;
}> {
  const { username, password, sessionCookie, targetDb } = target;
  const nextSync = getNextScheduledSyncTime();

  try {
    const secrets = username ? authService.getUser2FASecrets(username) : undefined;
    const reports = await scrapeWebnotes({
      username,
      password,
      sessionCookie,
      totpSecret: secrets?.totpSecret,
      grid: secrets?.grid,
      preferredMethod: secrets?.preferredMethod,
    });

    if (reports && reports.length > 0) {
      const { newlyDetected } = targetDb.setGrades(reports);
      targetDb.updateSyncStatus({
        lastSyncTime: new Date().toISOString(),
        nextScheduledSync: nextSync.toISOString(),
        lastSyncResult: "success",
        lastSyncMessage: `Succès : ${reports.length} semestre(s) synchronisé(s), ${newlyDetected.length} nouvelle(s) note(s)`,
      });

      console.log(
        `[Scheduler] ✅ Webnotes (${username || "env"}) : ${reports.length} semestre(s), ${newlyDetected.length} nouvelle(s) note(s).`
      );
      return { success: true, reportsCount: reports.length, newlyDetected };
    }

    const errorMsg = "Aucun semestre retourné par Webnotes";
    targetDb.updateSyncStatus({
      lastSyncTime: new Date().toISOString(),
      nextScheduledSync: nextSync.toISOString(),
      lastSyncResult: "error",
      lastSyncMessage: errorMsg,
    });
    return { success: false, reportsCount: 0, newlyDetected: [], error: errorMsg };
  } catch (err: any) {
    console.error(`[Scheduler] ❌ Webnotes (${username || "env"}) :`, err.message);
    targetDb.updateSyncStatus({
      lastSyncTime: new Date().toISOString(),
      nextScheduledSync: nextSync.toISOString(),
      lastSyncResult: "error",
      lastSyncMessage: `Erreur: ${err.message}`,
    });
    return { success: false, reportsCount: 0, newlyDetected: [], error: err.message };
  }
}

async function syncScheduleForTarget(target: SyncTarget): Promise<void> {
  const { username, password, targetDb } = target;
  if (username && password) {
    try {
      const sorted = await fetchLiveZimbraSchedule(username, password);
      const { changes } = targetDb.setScheduleEvents(sorted);
      if (changes.length > 0) {
        console.log(
          `[Scheduler] 📅 Emploi du temps (${username}) : ${changes.length} changement(s) détecté(s).`
        );
      }
      return;
    } catch (err: any) {
      console.warn(`[Scheduler] Emploi du temps (${username}) indisponible :`, err.message);
    }
  }

  try {
    reloadEventsFromStore(undefined, targetDb);
  } catch {
    // Ignorer si aucun store local
  }
}

async function syncMailScheduleForTarget(target: SyncTarget): Promise<void> {
  const { username, password, targetDb } = target;
  if (!username || !password) return;
  const aiConfig = targetDb.getAIConfig();
  if (!aiConfig.enabled) return;

  try {
    const res = await mailService.listMessages(15, 0, true, { username, password }, "INBOX");
    if (res?.messages?.length > 0) {
      await mailService.triageMessages(
        res.messages.map((m) => ({
          id: m.id,
          messageId: m.messageId,
          subject: m.subject,
          from: m.from,
          senderName: m.from,
          date: m.date,
          snippet: m.snippet,
          resourceCode: m.resourceCode,
        })),
        { folder: "INBOX", creds: { username, password }, currentDb: targetDb, aiConfig }
      );
    }
  } catch (err: any) {
    console.warn(`[Scheduler] Analyse mails EDT (${username}) ignorée :`, err.message);
  }
}

export async function runWebnotesSync(): Promise<{
  success: boolean;
  reportsCount: number;
  newlyDetected: DetectedNewGrade[];
  error?: string;
}> {
  const targets = getSyncTargets();
  if (targets.length === 0) {
    const errorMsg = "Aucune session active ni identifiant ENT configuré dans .env";
    db.updateSyncStatus({
      lastSyncResult: "error",
      lastSyncMessage: errorMsg,
    });
    return { success: false, reportsCount: 0, newlyDetected: [], error: errorMsg };
  }

  let totalReports = 0;
  const allDetected: DetectedNewGrade[] = [];
  let anySuccess = false;
  let lastError: string | undefined;

  for (const target of targets) {
    const res = await syncGradesForTarget(target);
    if (res.success) {
      anySuccess = true;
      totalReports += res.reportsCount;
      allDetected.push(...res.newlyDetected);
    } else {
      lastError = res.error;
    }
  }

  return {
    success: anySuccess,
    reportsCount: totalReports,
    newlyDetected: allDetected,
    error: anySuccess ? undefined : lastError,
  };
}

export async function runFullAutoSync(includeMoodle = false): Promise<void> {
  if (isSyncRunning) return;
  const targets = getSyncTargets();
  if (targets.length === 0) return;

  isSyncRunning = true;
  try {
    console.log(`[Scheduler] 🔄 Synchronisation automatique (${targets.length} compte(s))...`);
    for (const target of targets) {
      await syncGradesForTarget(target);
      await syncScheduleForTarget(target);
      await syncMailScheduleForTarget(target);
    }

    if (includeMoodle) {
      try {
        await runMoodleScraper(false);
        console.log("[Scheduler] 📚 Synchronisation Moodle terminée.");
      } catch (err: any) {
        console.warn("[Scheduler] Moodle sync ignorée :", err.message);
      }
    }
  } finally {
    isSyncRunning = false;
  }
}

let isMailSyncRunning = false;
const MAIL_SYNC_INTERVAL_MS = 3 * 60 * 1000;

export async function runProactiveMailSync(): Promise<void> {
  if (isMailSyncRunning) return;
  const targets = getSyncTargets().filter((t) => t.username && t.password);
  if (targets.length === 0) return;

  isMailSyncRunning = true;
  try {
    for (const target of targets) {
      const aiConfig = target.targetDb.getAIConfig();
      if (!aiConfig.enabled) continue;

      const creds = { username: target.username!, password: target.password! };
      try {
        const list = await mailService.getMessages(10, 0, true, creds, "INBOX");
        const triageMap = mailService.loadTriageMap(creds.username);
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        const pending = (list.messages || []).filter((m) => {
          const key = m.messageId ? m.messageId.trim() : `uid:${m.id}`;
          const existing = triageMap[key];
          if (!existing) return true;
          const isAuth = Boolean(target.targetDb.isAuthorizedSender(m.from || "", m.senderName));
          const isRecent = !m.date || new Date(m.date).getTime() >= sevenDaysAgo;
          return isAuth && isRecent && !existing.scheduleProcessed;
        });

        if (pending.length > 0) {
          const triaged = await mailService.triageMessagesBatch(pending.slice(0, 5), {
            folder: "INBOX",
            creds,
            currentDb: target.targetDb,
            aiConfig,
          });
          const actionsCount = Object.values(triaged).reduce(
            (sum, meta) => sum + (meta.aiScheduleActions?.length || 0),
            0
          );
          if (actionsCount > 0) {
            console.log(
              `[Scheduler] 📬 IA proactive (${creds.username}) : ${actionsCount} mise(s) à jour EDT / visio appliquée(s) depuis les mails.`
            );
          }
        }
      } catch (err: any) {
        console.warn(`[Scheduler] Mail proactif (${creds.username}) ignoré :`, err.message);
      }
    }
  } finally {
    isMailSyncRunning = false;
  }
}

export function startGradeScheduler() {
  const nextSync = getNextScheduledSyncTime();
  db.updateSyncStatus({ nextScheduledSync: nextSync.toISOString() });

  const intervalMin = Math.round(GRADE_SYNC_INTERVAL_MS / 60000);
  console.log(
    `[Scheduler] ⏰ Synchronisation automatique active (notes & EDT toutes les ${intervalMin} min, mails IA toutes les 3 min, Moodle toutes les ${intervalMin * MOODLE_SYNC_EVERY_N_CYCLES} min).`
  );

  // Premier passage peu après le démarrage (inclut Moodle pour récupérer tous les cours)
  setTimeout(() => {
    void runFullAutoSync(true);
  }, 15 * 1000);

  // Surveillance proactive des mails & mise à jour EDT/visio en arrière-plan
  setTimeout(() => {
    void runProactiveMailSync();
  }, 10 * 1000);

  setInterval(() => {
    void runProactiveMailSync();
  }, MAIL_SYNC_INTERVAL_MS);

  setInterval(() => {
    cycleCount += 1;
    const includeMoodle = cycleCount % MOODLE_SYNC_EVERY_N_CYCLES === 0;
    void runFullAutoSync(includeMoodle);
  }, GRADE_SYNC_INTERVAL_MS);
}
