import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { MailMessage, MailDetail, MailSendPayload, AIUserConfig } from "../../src/types/index.js";
import { aiService } from "./aiService.js";
import { authService } from "./authService.js";
import type { Database } from "../db.js";

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
  aiSummary: string;
  aiPriority: "low" | "normal" | "high" | "urgent";
  aiCategory: string;
  aiActionRequired: boolean;
  aiTags?: string[];
  triagedAt: string;
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

export class MailService {
  private getTriageFilePath(username?: string): string {
    const safeUser = (username || "default").toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
    const dir = path.resolve(ROOT_DIR, "data/users", safeUser);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.resolve(dir, "mail_triage.json");
  }

  public loadTriageMap(username?: string): Record<string, MailTriageMeta> {
    const file = this.getTriageFilePath(username);
    if (!fs.existsSync(file)) return {};
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return {};
    }
  }

  public saveTriageEntry(username: string | undefined, key: string, meta: MailTriageMeta) {
    const file = this.getTriageFilePath(username);
    const map = this.loadTriageMap(username);
    map[key] = meta;
    try {
      fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf-8");
    } catch (e) {
      console.error("[-] Erreur écriture mail_triage.json:", e);
    }
  }

  private getMessageTriageKey(m: { messageId?: string; id: string }): string {
    return m.messageId ? m.messageId.trim() : `uid:${m.id}`;
  }

  private enrichWithTriage<T extends MailMessage>(msg: T, triageMap: Record<string, MailTriageMeta>): T {
    const meta = triageMap[this.getMessageTriageKey(msg)] || triageMap[`uid:${msg.id}`];
    if (!meta) return msg;
    return {
      ...msg,
      aiSummary: meta.aiSummary,
      aiPriority: meta.aiPriority,
      aiCategory: meta.aiCategory,
      aiActionRequired: meta.aiActionRequired,
      aiTags: meta.aiTags,
      aiScheduleActions: meta.aiScheduleActions,
    };
  }

  private getMailCacheFilePath(username?: string): string {
    const safeUser = (username || "default").toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
    const dir = path.resolve(ROOT_DIR, "data/users", safeUser);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.resolve(dir, "mail_cache.json");
  }

  private loadDiskCache(username: string | undefined, folder: string): CachedMailEntry | undefined {
    try {
      const file = this.getMailCacheFilePath(username);
      if (!fs.existsSync(file)) return undefined;
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      const entry = parsed?.[folder];
      if (!entry || !entry.data || !Array.isArray(entry.data.messages)) return undefined;
      return {
        data: entry.data,
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : 0,
        isFullList: Boolean(entry.isFullList),
      };
    } catch {
      return undefined;
    }
  }

  private saveDiskCache(username: string | undefined, folder: string, entry: CachedMailEntry): void {
    try {
      const file = this.getMailCacheFilePath(username);
      let all: Record<string, CachedMailEntry> = {};
      if (fs.existsSync(file)) {
        try {
          all = JSON.parse(fs.readFileSync(file, "utf-8")) || {};
        } catch {
          all = {};
        }
      }
      all[folder] = entry;
      fs.writeFileSync(file, JSON.stringify(all), "utf-8");
    } catch {
      // Ignore disk cache write errors
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

      if (existingMeta) {
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

      const bodyText = await ensureBodyText();

      try {
        // 1. Pré-classement ultra-rapide via gemini-decision-1 (0 token de sortie)
        const decision = await aiService.triageMailWithDecision(aiConfig, {
          from: item.from,
          subject: item.subject,
          bodyText,
        });

        if (decision) {
          let aiScheduleActions: MailTriageMeta["aiScheduleActions"] = undefined;
          let scheduleProcessed = true;

          if (shouldCheckSchedule && isRecent && decision.needsScheduleCheck) {
            scheduleProcessed = false;
            try {
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
              scheduleProcessed = true;
              if (schedRes.actions.length > 0) {
                aiScheduleActions = schedRes.actions;
              }
            } catch (e) {
              console.warn(`[-] Traitement EDT IA ignoré pour ${item.id}:`, e);
            }
          }

          const cleanSnippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 140);
          const meta: MailTriageMeta = {
            aiSummary: aiScheduleActions?.[0]?.summary || cleanSnippet || String(item.subject || "").slice(0, 140),
            aiPriority: decision.priority,
            aiCategory: decision.category,
            aiActionRequired: decision.actionRequired,
            aiTags: [decision.category],
            triagedAt: new Date().toISOString(),
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
  "aiSummary": "Résumé très concis en 1 phrase (max 140 caractères)",
  "aiPriority": "low | normal | high | urgent",
  "aiCategory": "Action requise | Planning | Cours | Notes | Administratif | Information",
  "aiActionRequired": true ou false,
  "aiTags": ["tag1", "tag2"]
}

De : ${item.from || ""}
Objet : ${item.subject || ""}
Contenu :
${bodyText.slice(0, 2000)}`;

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
          let aiScheduleActions: MailTriageMeta["aiScheduleActions"] = undefined;
          let scheduleProcessed = false;

          if (shouldCheckSchedule && isRecent) {
            try {
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
                currentDb
              );
              scheduleProcessed = true;
              if (schedRes.actions.length > 0) {
                aiScheduleActions = schedRes.actions;
              }
            } catch (e) {
              console.warn(`[-] Traitement EDT IA ignoré pour ${item.id}:`, e);
            }
          }

          const meta: MailTriageMeta = {
            aiSummary: String(parsed.aiSummary || item.subject || "").slice(0, 180),
            aiPriority: ["low", "normal", "high", "urgent"].includes(parsed.aiPriority)
              ? parsed.aiPriority
              : "normal",
            aiCategory: String(parsed.aiCategory || "Information"),
            aiActionRequired: Boolean(parsed.aiActionRequired),
            aiTags: Array.isArray(parsed.aiTags) ? parsed.aiTags.slice(0, 3).map(String) : [],
            triagedAt: new Date().toISOString(),
            scheduleProcessed,
            ...(aiScheduleActions ? { aiScheduleActions } : {}),
          };
          this.saveTriageEntry(creds?.username, key, meta);
          triagedOutput[item.id] = meta;
        }
      } catch (e: any) {
        console.warn(`[-] Triage IA ignoré pour message ${item.id}:`, e?.message || e);
        if (shouldCheckSchedule && isRecent) {
          try {
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
            if (schedRes.actions.length > 0) {
              const meta: MailTriageMeta = {
                aiSummary: String(item.subject || schedRes.actions[0].summary).slice(0, 180),
                aiPriority: "high",
                aiCategory: "Planning",
                aiActionRequired: false,
                aiTags: ["Visio", "EDT"],
                triagedAt: new Date().toISOString(),
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
