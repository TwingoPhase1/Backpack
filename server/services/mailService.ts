import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { MailMessage, MailDetail, MailSendPayload, AIUserConfig } from "../../src/types/index.js";
import { aiService } from "./aiService.js";
import { authService } from "./authService.js";
import type { Database } from "../db.js";
import { sqlite, withTransaction, getMeta, setMeta } from "../sqlite.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../");
const SCRIPT_PATH = path.resolve(ROOT_DIR, "scripts/fetch_mail.py");

interface MailListResult {
  folder: string;
  totalCount: number;
  unreadCount: number;
  messages: MailMessage[];
}

export interface MailTriageMeta {
  aiSummary?: string;
  aiPriority: "low" | "normal" | "high" | "urgent";
  aiCategory: string;
  aiActionRequired: boolean;
  aiShouldNotify?: boolean;
  aiNotifText?: string;
  aiTags?: string[];
  triagedAt: string;
  summaryVersion?: number;
  scheduleProcessed?: boolean;
  aiScheduleActions?: Array<{ action: string; summary: string; eventId?: string; visioUrl?: string }>;
}

interface CachedMailEntry {
  data: MailListResult;
  timestamp: number;
  isFullList: boolean;
}

const userMailCaches = new Map<string, CachedMailEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000;
const migratedTriageUsers = new Set<string>();
const migratedCacheUsers = new Set<string>();

const stmtSelectTriageAll = sqlite.prepare("SELECT message_key, data FROM mail_triage WHERE username = ?");
const stmtUpsertTriage = sqlite.prepare(
  "INSERT OR REPLACE INTO mail_triage (username, message_key, priority, category, action_required, should_notify, summary_version, triaged_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
const stmtSelectMailCache = sqlite.prepare(
  "SELECT timestamp, is_full_list, data FROM mail_cache WHERE username = ? AND folder = ?"
);
const stmtUpsertMailCache = sqlite.prepare(
  "INSERT OR REPLACE INTO mail_cache (username, folder, timestamp, is_full_list, data) VALUES (?, ?, ?, ?, ?)"
);

export class MailService {
  private normalizeUserKey(username?: string): string {
    return (username || "_default").toLowerCase().trim();
  }

  private getTriageFilePath(username?: string): string {
    const safeUser = (username || "default").toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
    return path.resolve(ROOT_DIR, "data/users", safeUser, "mail_triage.json");
  }

  private ensureTriageMigrated(username?: string): string {
    const userKey = this.normalizeUserKey(username);
    if (migratedTriageUsers.has(userKey)) return userKey;

    const metaKey = `migrated_mail_triage:${userKey}`;
    if (!getMeta(metaKey)) {
      const legacyFile = this.getTriageFilePath(username);
      if (fs.existsSync(legacyFile)) {
        try {
          const map = JSON.parse(fs.readFileSync(legacyFile, "utf-8")) as Record<string, MailTriageMeta>;
          const entries = Object.entries(map || {});
          if (entries.length > 0) {
            withTransaction(() => {
              for (const [key, meta] of entries) {
                stmtUpsertTriage.run(
                  userKey,
                  key,
                  meta.aiPriority || "normal",
                  meta.aiCategory || "Information",
                  meta.aiActionRequired ? 1 : 0,
                  meta.aiShouldNotify === undefined ? null : meta.aiShouldNotify ? 1 : 0,
                  meta.summaryVersion ?? null,
                  meta.triagedAt ?? null,
                  JSON.stringify(meta)
                );
              }
            });
            console.log(`[+] Migration SQLite mail_triage (${userKey}) : ${entries.length} entrée(s).`);
          }
        } catch (e) {
          console.error("[-] Erreur migration mail_triage.json vers SQLite:", e);
        }
      }
      setMeta(metaKey, "1");
    }

    migratedTriageUsers.add(userKey);
    return userKey;
  }

  public loadTriageMap(username?: string): Record<string, MailTriageMeta> {
    const userKey = this.ensureTriageMigrated(username);
    const out: Record<string, MailTriageMeta> = {};
    try {
      const rows = stmtSelectTriageAll.all(userKey) as Array<{ message_key: string; data: string }>;
      for (const row of rows) {
        try {
          out[row.message_key] = JSON.parse(row.data);
        } catch {}
      }
    } catch (e) {
      console.error("[-] Erreur lecture table mail_triage SQLite:", e);
    }
    return out;
  }

  public saveTriageEntry(username: string | undefined, key: string, meta: MailTriageMeta) {
    const userKey = this.ensureTriageMigrated(username);
    try {
      stmtUpsertTriage.run(
        userKey,
        key,
        meta.aiPriority || "normal",
        meta.aiCategory || "Information",
        meta.aiActionRequired ? 1 : 0,
        meta.aiShouldNotify === undefined ? null : meta.aiShouldNotify ? 1 : 0,
        meta.summaryVersion ?? null,
        meta.triagedAt ?? null,
        JSON.stringify(meta)
      );
    } catch (e) {
      console.error("[-] Erreur écriture table mail_triage SQLite:", e);
    }
  }

  private getMessageTriageKey(m: { messageId?: string; id: string }): string {
    return m.messageId ? m.messageId.trim() : `uid:${m.id}`;
  }

  private enrichWithTriage<T extends MailMessage>(msg: T, triageMap: Record<string, MailTriageMeta>): T {
    const meta = triageMap[this.getMessageTriageKey(msg)] || triageMap[`uid:${msg.id}`];
    if (!meta) return msg;
    const isV3 = meta.summaryVersion === 3;
    return {
      ...msg,
      aiSummary: isV3 && meta.aiSummary ? meta.aiSummary : undefined,
      aiTriaged: isV3,
      aiPriority: meta.aiPriority,
      aiCategory: meta.aiCategory,
      aiActionRequired: meta.aiActionRequired,
      aiShouldNotify: isV3 ? meta.aiShouldNotify : undefined,
      aiNotifText: isV3 && meta.aiNotifText ? meta.aiNotifText : undefined,
      aiTags: meta.aiTags,
      aiScheduleActions: meta.aiScheduleActions,
    };
  }

  private getMailCacheFilePath(username?: string): string {
    const safeUser = (username || "default").toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
    return path.resolve(ROOT_DIR, "data/users", safeUser, "mail_cache.json");
  }

  private ensureMailCacheMigrated(username?: string): string {
    const userKey = this.normalizeUserKey(username);
    if (migratedCacheUsers.has(userKey)) return userKey;

    const metaKey = `migrated_mail_cache:${userKey}`;
    if (!getMeta(metaKey)) {
      const legacyFile = this.getMailCacheFilePath(username);
      if (fs.existsSync(legacyFile)) {
        try {
          const all = JSON.parse(fs.readFileSync(legacyFile, "utf-8")) as Record<string, CachedMailEntry>;
          const entries = Object.entries(all || {});
          if (entries.length > 0) {
            withTransaction(() => {
              for (const [folder, entry] of entries) {
                if (!entry?.data || !Array.isArray(entry.data.messages)) continue;
                stmtUpsertMailCache.run(
                  userKey,
                  folder,
                  typeof entry.timestamp === "number" ? entry.timestamp : 0,
                  entry.isFullList ? 1 : 0,
                  JSON.stringify(entry.data)
                );
              }
            });
            console.log(`[+] Migration SQLite mail_cache (${userKey}) : ${entries.length} dossier(s).`);
          }
        } catch (e) {
          console.error("[-] Erreur migration mail_cache.json vers SQLite:", e);
        }
      }
      setMeta(metaKey, "1");
    }

    migratedCacheUsers.add(userKey);
    return userKey;
  }

  private loadDiskCache(username: string | undefined, folder: string): CachedMailEntry | undefined {
    try {
      const userKey = this.ensureMailCacheMigrated(username);
      const row = stmtSelectMailCache.get(userKey, folder) as
        | { timestamp: number; is_full_list: number; data: string }
        | undefined;
      if (!row || typeof row.data !== "string") return undefined;
      const data = JSON.parse(row.data) as MailListResult;
      if (!data || !Array.isArray(data.messages)) return undefined;
      return {
        data,
        timestamp: typeof row.timestamp === "number" ? row.timestamp : 0,
        isFullList: Boolean(row.is_full_list),
      };
    } catch {
      return undefined;
    }
  }

  private saveDiskCache(username: string | undefined, folder: string, entry: CachedMailEntry): void {
    try {
      const userKey = this.ensureMailCacheMigrated(username);
      stmtUpsertMailCache.run(
        userKey,
        folder,
        entry.timestamp,
        entry.isFullList ? 1 : 0,
        JSON.stringify(entry.data)
      );
    } catch {
      // Ignore SQLite cache write errors
    }
  }

  private updateCachedReadState(
    username: string | undefined,
    folder: string,
    id: string,
    isUnread: boolean
  ): void {
    const cacheKey = `${username || "default"}:${folder}`;
    const entry = userMailCaches.get(cacheKey) || this.loadDiskCache(username, folder);
    if (!entry) return;
    let changed = false;
    const messages = entry.data.messages.map((m) => {
      if (String(m.id) === String(id) && m.isUnread !== isUnread) {
        changed = true;
        return { ...m, isUnread };
      }
      return m;
    });
    if (!changed) return;
    const unreadCount = messages.filter((m) => m.isUnread).length;
    const updated: CachedMailEntry = {
      ...entry,
      data: { ...entry.data, messages, unreadCount },
    };
    userMailCaches.set(cacheKey, updated);
    if (updated.isFullList) {
      this.saveDiskCache(username, folder, updated);
    }
  }

  private removeCachedMessage(username: string | undefined, folder: string, id: string): void {
    const cacheKey = `${username || "default"}:${folder}`;
    const entry = userMailCaches.get(cacheKey) || this.loadDiskCache(username, folder);
    if (!entry) return;
    const before = entry.data.messages.length;
    const messages = entry.data.messages.filter((m) => String(m.id) !== String(id));
    if (messages.length === before) return;
    const unreadCount = messages.filter((m) => m.isUnread).length;
    const updated: CachedMailEntry = {
      ...entry,
      data: {
        ...entry.data,
        messages,
        totalCount: Math.max(0, entry.data.totalCount - (before - messages.length)),
        unreadCount,
      },
    };
    userMailCaches.set(cacheKey, updated);
    if (updated.isFullList) {
      this.saveDiskCache(username, folder, updated);
    }
  }

  private invalidateUserCache(username?: string) {
    const prefix = `${username || "default"}:`;
    for (const key of userMailCaches.keys()) {
      if (key.startsWith(prefix)) {
        userMailCaches.delete(key);
      }
    }
  }

  private async runPython(
    args: string[],
    creds?: { username: string; password: string },
    stdinJson?: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...(creds?.username ? { ENT_USER: creds.username } : {}),
        ...(creds?.password ? { ENT_PASS: creds.password } : {}),
      };

      const py = spawn("python", [SCRIPT_PATH, ...args], { cwd: ROOT_DIR, env });

      let stdout = "";
      let stderr = "";

      py.stdout.on("data", (d) => {
        stdout += d.toString();
      });

      py.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      py.on("close", (code) => {
        if (code !== 0 && !stdout.trim()) {
          return reject(new Error(stderr || `Le script mail a retourné le code ${code}`));
        }
        try {
          const json = JSON.parse(stdout);
          if (!json.success && json.error) {
            return reject(new Error(json.error));
          }
          resolve(json);
        } catch (e: any) {
          reject(new Error(`Réponse IMAP/SMTP invalide: ${e.message}`));
        }
      });

      if (stdinJson !== undefined) {
        py.stdin.write(JSON.stringify(stdinJson));
        py.stdin.end();
      }
    });
  }

  async getMessages(
    limit = 30,
    offset = 0,
    forceRefresh = false,
    creds?: { username: string; password: string },
    folder = "INBOX"
  ): Promise<MailListResult> {
    const cacheKey = `${creds?.username || "default"}:${folder}`;
    const triageMap = this.loadTriageMap(creds?.username);

    if (!forceRefresh && offset === 0) {
      let cached = userMailCaches.get(cacheKey);
      if (!cached) {
        cached = this.loadDiskCache(creds?.username, folder);
        if (cached) {
          userMailCaches.set(cacheKey, cached);
        }
      }

      if (cached && cached.isFullList) {
        const isFresh = Date.now() - cached.timestamp < CACHE_TTL_MS;
        // Pour un appel complet (ouverture de la boîte mail), on renvoie immédiatement le cache disque
        // même s'il date de >3 min (le front rafraîchira en silence si nécessaire), tant qu'on a un cache complet.
        if (isFresh || limit === 0) {
          const sliced = limit > 0 ? cached.data.messages.slice(0, limit) : cached.data.messages;
          return {
            ...cached.data,
            messages: sliced.map((m) => this.enrichWithTriage(m, triageMap)),
          };
        }
      }
    }

    const res = await this.runPython(
      ["--list", "--folder", folder, "--limit", String(limit), "--offset", String(offset)],
      creds
    );

    const enrichedMessages: MailMessage[] = (res.messages || []).map((m: MailMessage) =>
      this.enrichWithTriage(m, triageMap)
    );

    const result: MailListResult = {
      folder,
      totalCount: res.totalCount || 0,
      unreadCount: res.unreadCount || 0,
      messages: enrichedMessages,
    };

    if (offset === 0 && limit === 0) {
      // Ne persister en cache complet que lorsque toute la boîte a été récupérée (limit === 0)
      const entry: CachedMailEntry = {
        data: result,
        timestamp: Date.now(),
        isFullList: true,
      };
      userMailCaches.set(cacheKey, entry);
      this.saveDiskCache(creds?.username, folder, entry);
    } else if (offset === 0 && limit > 0) {
      // Un appel partiel (ex: scheduler avec limit=10) ne doit JAMAIS écraser le cache complet.
      // Si un cache complet existe déjà, on fusionne les nouveaux messages éventuels en tête.
      const existing = userMailCaches.get(cacheKey) || this.loadDiskCache(creds?.username, folder);
      if (existing && existing.isFullList) {
        const existingById = new Map(existing.data.messages.map((m) => [String(m.id), m]));
        for (const m of enrichedMessages) {
          existingById.set(String(m.id), m);
        }
        const incomingIds = new Set(enrichedMessages.map((m) => String(m.id)));
        const merged = [
          ...enrichedMessages,
          ...existing.data.messages.filter((m) => !incomingIds.has(String(m.id))),
        ];
        const updated: CachedMailEntry = {
          data: {
            folder,
            totalCount: Math.max(result.totalCount, merged.length),
            unreadCount: result.unreadCount,
            messages: merged,
          },
          timestamp: Date.now(),
          isFullList: true,
        };
        userMailCaches.set(cacheKey, updated);
        this.saveDiskCache(creds?.username, folder, updated);
      }
    }

    return result;
  }

  async getMessage(
    id: string,
    creds?: { username: string; password: string },
    folder = "INBOX"
  ): Promise<MailDetail> {
    const res = await this.runPython(["--get", String(id), "--folder", folder], creds);
    const triageMap = this.loadTriageMap(creds?.username);
    this.updateCachedReadState(creds?.username, folder, id, false);
    return this.enrichWithTriage(res.message, triageMap);
  }

  async getAttachment(
    msgId: string,
    partIndex: number,
    creds?: { username: string; password: string },
    folder = "INBOX"
  ): Promise<{ tempPath: string; filename: string }> {
    const tmpDir = path.resolve(ROOT_DIR, "data/temp_mail");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const outPath = path.resolve(tmpDir, `att_${msgId}_${partIndex}_${Date.now()}`);
    const res = await this.runPython(
      ["--attachment", String(msgId), "--folder", folder, "--part", String(partIndex), "--out", outPath],
      creds
    );

    return {
      tempPath: outPath,
      filename: res.filename || "piece_jointe",
    };
  }

  async markRead(
    id: string,
    read: boolean,
    creds?: { username: string; password: string },
    folder = "INBOX"
  ): Promise<{ success: boolean; id: string; isUnread: boolean }> {
    const flag = read ? "--mark-read" : "--mark-unread";
    const res = await this.runPython([flag, String(id), "--folder", folder], creds);
    this.updateCachedReadState(creds?.username, folder, id, !read);
    return res;
  }

  async deleteMessage(
    id: string,
    creds?: { username: string; password: string },
    folder = "INBOX"
  ): Promise<{ success: boolean }> {
    const res = await this.runPython(["--delete", String(id), "--folder", folder], creds);
    this.removeCachedMessage(creds?.username, folder, id);
    return res;
  }

  async sendEmail(payload: MailSendPayload, creds?: { username: string; password: string }) {
    const res = await this.runPython(["--send"], creds, payload);
    this.invalidateUserCache(creds?.username);
    return res;
  }

  async saveDraft(payload: MailSendPayload, creds?: { username: string; password: string }) {
    const res = await this.runPython(["--save-draft"], creds, payload);
    this.invalidateUserCache(creds?.username);
    return res;
  }

  async resolveTeachersFromGal(
    names: string[],
    creds?: { username: string; password: string }
  ): Promise<Array<{ email: string; name: string }>> {
    if (!names.length) return [];
    const res = await this.runPython(["--resolve-gal"], creds, { names });
    return res.teachers || [];
  }

  /**
   * Analyse un lot de courriels avec l'IA (résumé/priorité + mise à jour proactive de l'EDT pour profs/staff).
   */
  async triageMessagesBatch(
    items: Array<{
      id: string;
      messageId?: string;
      subject?: string;
      from?: string;
      senderName?: string;
      date?: string;
      bodyText?: string;
      resourceCode?: string;
    }>,
    options: {
      folder?: string;
      creds?: { username: string; password: string };
      currentDb: Database;
      aiConfig: AIUserConfig;
    }
  ): Promise<Record<string, MailTriageMeta>> {
    const { folder = "INBOX", creds, currentDb, aiConfig } = options;
    if (!aiConfig.enabled || items.length === 0) return {};

    const triageMap = this.loadTriageMap(creds?.username);
    const triagedOutput: Record<string, MailTriageMeta> = {};
    const userSummary = creds?.username
      ? authService.getAllUsers().find((u) => u.username === creds.username)
      : undefined;
    const studentCtx = creds?.username
      ? { username: creds.username, name: userSummary?.name }
      : undefined;

    // Auto-synchronisation initiale du répertoire des profs depuis Zimbra GAL si vide
    if (
      currentDb.getAuthorizedSenders().filter((s) => s.role === "teacher").length === 0 &&
      currentDb.getUniqueScheduleTeacherNames().length > 0 &&
      creds?.username
    ) {
      try {
        const names = currentDb.getUniqueScheduleTeacherNames();
        const resolved = await this.resolveTeachersFromGal(names, creds);
        if (resolved.length > 0) {
          const nowIso = new Date().toISOString();
          currentDb.upsertAuthorizedSenders(
            resolved.map((t) => ({ email: t.email, name: t.name, role: "teacher", addedAt: nowIso }))
          );
        }
      } catch (e) {
        console.warn("[-] Sync GAL profs ignorée:", e);
      }
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const item of items) {
      const key = item.messageId ? String(item.messageId).trim() : `uid:${item.id}`;
      const existingMeta = triageMap[key];
      const authorizedSender = currentDb.isAuthorizedSender(item.from || "", item.senderName);
      const fromLower = String(item.from || "").toLowerCase();
      const isUnicaenStaffDomain = fromLower.includes("@unicaen.fr") && !fromLower.includes("@etu.unicaen.fr");
      const hasScheduleKeyword = /annul|cours|tp\b|td\b|cm\b|report|déplac|deplac|salle|visio|distanciel|à distance|a distance|rattrapage|absen|supprim/i.test(
        `${item.subject || ""} ${item.snippet || ""}`
      );
      const shouldCheckSchedule = Boolean(authorizedSender || (isUnicaenStaffDomain && hasScheduleKeyword));
      const itemTime = item.date ? new Date(item.date).getTime() : Date.now();
      const isRecent = Number.isNaN(itemTime) || itemTime >= sevenDaysAgo;

      const ensureBodyText = async (): Promise<string> => {
        if (item.bodyText) return item.bodyText;
        if (item.id) {
          try {
            const detail = await this.getMessage(String(item.id), creds, folder);
            return detail.bodyText || detail.bodyHtml?.replace(/<[^>]+>/g, " ") || "";
          } catch {}
        }
        return "";
      };

      if (existingMeta && existingMeta.summaryVersion === 3) {
        if (shouldCheckSchedule && isRecent && !existingMeta.scheduleProcessed) {
          try {
            const bodyText = await ensureBodyText();
            const schedRes = await aiService.processMailForSchedule(
              aiService.resolveConfigForRole(aiConfig, "schedule_agent"),
              {
                id: String(item.id),
                subject: item.subject || "",
                from: item.from || "",
                senderName: item.senderName || authorizedSender?.name,
                date: item.date || new Date().toISOString(),
                bodyText,
                resourceCode: item.resourceCode,
              },
              currentDb,
              studentCtx
            );
            const updatedMeta: MailTriageMeta = {
              ...existingMeta,
              scheduleProcessed: true,
              ...(schedRes.actions.length > 0 ? { aiScheduleActions: schedRes.actions } : {}),
            };
            this.saveTriageEntry(creds?.username, key, updatedMeta);
            triagedOutput[item.id] = updatedMeta;
            continue;
          } catch (e) {
            console.warn(`[-] Traitement EDT IA ignoré pour ${item.id}:`, e);
          }
        }
        triagedOutput[item.id] = existingMeta;
        continue;
      }

      const rawBodyText = await ensureBodyText();
      // Nettoyer les citations de réponses précédentes et signatures pour aider l'IA à synthétiser le cœur du message
      const cleanedBodyForLLM = (() => {
        let txt = rawBodyText.replace(/\r\n/g, "\n");
        const quoteSplit = txt.search(/\n(?:Le [^\n]{6,80} a [ée]crit\s*:|On [^\n]{6,80} wrote:|----+ ?Message d['’]origine ?----+)/i);
        if (quoteSplit > 60) txt = txt.slice(0, quoteSplit);
        const sigSplit = txt.search(/\n--\s*\n|\nCordialement[\s,]*\n/i);
        if (sigSplit > 60) txt = txt.slice(0, sigSplit);
        return txt.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2500);
      })();

      const alreadyScheduleProcessed = Boolean(existingMeta?.scheduleProcessed);
      const existingActions = existingMeta?.aiScheduleActions;

      try {
        // 1. Pré-classement ultra-rapide via gemini-decision-1 : décide aussi si un résumé est utile
        const decision = await aiService.triageMailWithDecision(aiConfig, {
          from: item.from,
          subject: item.subject,
          bodyText: cleanedBodyForLLM,
        });

        if (decision) {
          let aiScheduleActions: MailTriageMeta["aiScheduleActions"] = existingActions;
          let scheduleProcessed = alreadyScheduleProcessed;

          if (shouldCheckSchedule && isRecent && !alreadyScheduleProcessed && (decision.needsScheduleCheck || hasScheduleKeyword)) {
            try {
              const schedRes = await aiService.processMailForSchedule(
                aiService.resolveConfigForRole(aiConfig, "schedule_agent"),
                {
                  id: String(item.id),
                  subject: item.subject || "",
                  from: item.from || "",
                  senderName: item.senderName || authorizedSender?.name,
                  date: item.date || new Date().toISOString(),
                  bodyText: rawBodyText,
                  resourceCode: item.resourceCode,
                },
                currentDb,
                studentCtx
              );
              scheduleProcessed = true;
              if (schedRes.actions.length > 0) {
                aiScheduleActions = schedRes.actions;
              }
            } catch (e) {
              console.warn(`[-] Traitement EDT IA ignoré pour ${item.id}:`, e);
            }
          }

          const shouldNotify = Boolean(decision.shouldNotify || (aiScheduleActions && aiScheduleActions.length > 0));
          let aiSummary: string | undefined = undefined;
          let aiNotifText: string | undefined = undefined;

          if (shouldNotify) {
            try {
              const notifPrompt = `Analyse ce courriel universitaire important et réponds STRICTEMENT en JSON valide (aucun texte autour) :
{
  "aiSummary": "Résumé synthétique et factuel en UNE SEULE phrase claire en français (maximum 140 caractères). INTERDICTION de recopier le début du mail, les formules de politesse ou la signature.",
  "aiNotifText": "Texte de notification ultra-concis et actionnable (maximum 85 caractères, style télégraphique direct, ex: 'TD R1.06 annulé demain 10h' ou 'Rendu SAE1.02 avant 18h')."
}

De : ${item.senderName ? `${item.senderName} <${item.from || ""}>` : (item.from || "")}
Objet : ${item.subject || ""}
Contenu :
${cleanedBodyForLLM}`;
              const triageAiConfig = aiService.resolveConfigForRole(aiConfig, "mail_triage");
              const tempConfig: AIUserConfig = { ...triageAiConfig, enableTools: false };
              const sumResult = await aiService.chatWithAgent(
                tempConfig,
                [{ role: "user", content: notifPrompt }],
                currentDb,
                creds
              );
              const raw = (sumResult.message.content || "").replace(/```json\s*|\s*```/g, "").trim();
              const match = raw.match(/\{[\s\S]*\}/);
              if (match) {
                try {
                  const parsedNotif = JSON.parse(match[0]);
                  const cleanStr = (val: unknown, maxLen: number): string | undefined => {
                    if (typeof val !== "string") return undefined;
                    const s = val.replace(/^["«»\s]+|["«»\s]+$/g, "").replace(/\s+/g, " ").trim();
                    return s ? s.slice(0, maxLen) : undefined;
                  };
                  aiSummary = cleanStr(parsedNotif.aiSummary, 180);
                  aiNotifText = cleanStr(parsedNotif.aiNotifText, 100);
                } catch {
                  const cleanedFallback = raw.replace(/^["«»\s]+|["«»\s]+$/g, "").replace(/\s+/g, " ").trim();
                  if (cleanedFallback) {
                    aiSummary = cleanedFallback.slice(0, 180);
                    aiNotifText = cleanedFallback.slice(0, 90);
                  }
                }
              } else {
                const cleanedFallback = raw.replace(/^["«»\s]+|["«»\s]+$/g, "").replace(/\s+/g, " ").trim();
                if (cleanedFallback) {
                  aiSummary = cleanedFallback.slice(0, 180);
                  aiNotifText = cleanedFallback.slice(0, 90);
                }
              }
            } catch (sumErr: any) {
              console.warn(`[-] Résumé/notif IA ignoré pour ${item.id}:`, sumErr?.message || sumErr);
            }
          } else if (decision.needsSummary && cleanedBodyForLLM.length >= 160) {
            try {
              const summaryPrompt = `Résume ce courriel universitaire en UNE SEULE phrase claire et factuelle en français (maximum 140 caractères).
Règles strictes :
- Reformule l'essentiel (information clé, consigne, date ou décision).
- INTERDICTION de recopier le début du mail, les formules de politesse ("Bonjour", "Bonne journée"), la signature ou des guillemets autour de la phrase.

De : ${item.senderName ? `${item.senderName} <${item.from || ""}>` : (item.from || "")}
Objet : ${item.subject || ""}
Contenu :
${cleanedBodyForLLM}`;
              const triageAiConfig = aiService.resolveConfigForRole(aiConfig, "mail_triage");
              const tempConfig: AIUserConfig = { ...triageAiConfig, enableTools: false };
              const sumResult = await aiService.chatWithAgent(
                tempConfig,
                [{ role: "user", content: summaryPrompt }],
                currentDb,
                creds
              );
              const cleanedSum = (sumResult.message.content || "")
                .replace(/^["«»\s]+|["«»\s]+$/g, "")
                .replace(/\s+/g, " ")
                .trim();
              if (cleanedSum) {
                aiSummary = cleanedSum.slice(0, 180);
              }
            } catch (sumErr: any) {
              console.warn(`[-] Résumé IA ignoré pour ${item.id}:`, sumErr?.message || sumErr);
            }
          }

          const meta: MailTriageMeta = {
            ...(aiSummary ? { aiSummary } : {}),
            aiPriority: decision.priority,
            aiCategory: decision.category,
            aiActionRequired: decision.actionRequired,
            aiShouldNotify: shouldNotify,
            ...(aiNotifText ? { aiNotifText } : {}),
            aiTags: [decision.category],
            triagedAt: new Date().toISOString(),
            summaryVersion: 3,
            scheduleProcessed,
            ...(aiScheduleActions ? { aiScheduleActions } : {}),
          };
          this.saveTriageEntry(creds?.username, key, meta);
          triagedOutput[item.id] = meta;
          continue;
        }

        // 2. Fallback LLM standard si gemini-decision-1 n'est pas disponible
        const prompt = `Analyse ce courriel universitaire et réponds STRICTEMENT en JSON valide (aucun texte autour) :
{
  "aiSummary": "Vrai résumé synthétique et reformulé en 1 phrase claire en français (max 140 caractères). Laisse une chaîne vide \"\" si le mail est très court ou trivial (1-2 phrases qui se lisent immédiatement). INTERDICTION de recopier le début du mail, les formules de politesse (Bonjour, Bonne journée) ou la signature.",
  "aiPriority": "low | normal | high | urgent",
  "aiCategory": "Action requise | Planning | Cours | Notes | Administratif | Information",
  "aiActionRequired": true ou false,
  "aiShouldNotify": true ou false,
  "aiNotifText": "Texte ultra-concis (max 85 caractères, actionnable) si aiShouldNotify=true, sinon \"\"",
  "aiTags": ["tag1", "tag2"],
  "needsScheduleCheck": true ou false
}

De : ${item.senderName ? `${item.senderName} <${item.from || ""}>` : (item.from || "")}
Objet : ${item.subject || ""}
Contenu :
${cleanedBodyForLLM}`;

        const triageAiConfig = aiService.resolveConfigForRole(aiConfig, "mail_triage");
        const tempConfig: AIUserConfig = { ...triageAiConfig, enableTools: false };
        const result = await aiService.chatWithAgent(
          tempConfig,
          [{ role: "user", content: prompt }],
          currentDb,
          creds
        );
        const raw = result.message.content || "";
        const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          let aiScheduleActions: MailTriageMeta["aiScheduleActions"] = existingActions;
          let scheduleProcessed = alreadyScheduleProcessed;

          if (shouldCheckSchedule && isRecent && !alreadyScheduleProcessed && (parsed.needsScheduleCheck || hasScheduleKeyword)) {
            try {
              const schedRes = await aiService.processMailForSchedule(
                aiService.resolveConfigForRole(aiConfig, "schedule_agent"),
                {
                  id: String(item.id),
                  subject: item.subject || "",
                  from: item.from || "",
                  senderName: item.senderName || authorizedSender?.name,
                  date: item.date || new Date().toISOString(),
                  bodyText: rawBodyText,
                  resourceCode: item.resourceCode,
                },
                currentDb,
                studentCtx
              );
              scheduleProcessed = true;
              if (schedRes.actions.length > 0) {
                aiScheduleActions = schedRes.actions;
              }
            } catch (e) {
              console.warn(`[-] Traitement EDT IA ignoré pour ${item.id}:`, e);
            }
          }

          const trimmedSummary = typeof parsed.aiSummary === "string" ? parsed.aiSummary.trim().slice(0, 180) : "";
          const trimmedNotifText = typeof parsed.aiNotifText === "string" ? parsed.aiNotifText.replace(/\s+/g, " ").trim().slice(0, 100) : "";
          const shouldNotify = Boolean(
            parsed.aiShouldNotify ||
            parsed.aiPriority === "urgent" ||
            (aiScheduleActions && aiScheduleActions.length > 0)
          );
          const meta: MailTriageMeta = {
            ...(trimmedSummary ? { aiSummary: trimmedSummary } : {}),
            aiPriority: ["low", "normal", "high", "urgent"].includes(parsed.aiPriority)
              ? parsed.aiPriority
              : "normal",
            aiCategory: String(parsed.aiCategory || "Information"),
            aiActionRequired: Boolean(parsed.aiActionRequired),
            aiShouldNotify: shouldNotify,
            ...(shouldNotify && trimmedNotifText ? { aiNotifText: trimmedNotifText } : {}),
            aiTags: Array.isArray(parsed.aiTags) ? parsed.aiTags.slice(0, 3).map(String) : [],
            triagedAt: new Date().toISOString(),
            summaryVersion: 3,
            scheduleProcessed,
            ...(aiScheduleActions ? { aiScheduleActions } : {}),
          };
          this.saveTriageEntry(creds?.username, key, meta);
          triagedOutput[item.id] = meta;
        }
      } catch (e: any) {
        console.warn(`[-] Triage IA ignoré pour message ${item.id}:`, e?.message || e);
        if (shouldCheckSchedule && isRecent && !alreadyScheduleProcessed) {
          try {
            const schedRes = await aiService.processMailForSchedule(
              aiService.resolveConfigForRole(aiConfig, "schedule_agent"),
              {
                id: String(item.id),
                subject: item.subject || "",
                from: item.from || "",
                senderName: item.senderName || authorizedSender?.name,
                date: item.date || new Date().toISOString(),
                bodyText: rawBodyText,
                resourceCode: item.resourceCode,
              },
              currentDb,
              studentCtx
            );
            if (schedRes.actions.length > 0) {
              const meta: MailTriageMeta = {
                aiPriority: "high",
                aiCategory: "Planning",
                aiActionRequired: false,
                aiShouldNotify: true,
                ...(schedRes.actions[0]?.summary ? { aiNotifText: schedRes.actions[0].summary.slice(0, 100) } : {}),
                aiTags: ["Visio", "EDT"],
                triagedAt: new Date().toISOString(),
                summaryVersion: 3,
                scheduleProcessed: true,
                aiScheduleActions: schedRes.actions,
              };
              this.saveTriageEntry(creds?.username, key, meta);
              triagedOutput[item.id] = meta;
            }
          } catch {}
        }
      }
    }

    return triagedOutput;
  }

  async getUnreadCount(creds?: { username: string; password: string }): Promise<number> {
    try {
      const res = await this.runPython(["--list", "--folder", "INBOX", "--limit", "1", "--offset", "0"], creds);
      return res.unreadCount || 0;
    } catch {
      return 0;
    }
  }
}

export const mailService = new MailService();
