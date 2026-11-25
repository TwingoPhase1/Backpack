import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import {
  User,
  AdminUserSummary,
  TwoFactorMethod,
  TwoFactorConfig,
  GridCellChallenge,
  AuthResponse,
} from "../../src/types/index.js";
import { deleteUserDb } from "../db.js";
import { sqlite, withTransaction, getMeta, setMeta, countUserNotes, hasUserInSqlite, DATA_DIR as SQLITE_DATA_DIR } from "../sqlite.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../");
const DATA_DIR = SQLITE_DATA_DIR;
const USERS_FILE = path.resolve(DATA_DIR, "users.json");
const SESSIONS_FILE = path.resolve(DATA_DIR, "sessions.json");
const SESSION_SECRET_FILE = path.resolve(DATA_DIR, ".session_secret");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Gestion de la clé de chiffrement pour les sessions sur disque
let sessionSecret: Buffer;
if (fs.existsSync(SESSION_SECRET_FILE)) {
  try {
    sessionSecret = fs.readFileSync(SESSION_SECRET_FILE);
  } catch {
    sessionSecret = crypto.randomBytes(32);
    fs.writeFileSync(SESSION_SECRET_FILE, sessionSecret);
  }
} else {
  sessionSecret = crypto.randomBytes(32);
  fs.writeFileSync(SESSION_SECRET_FILE, sessionSecret);
}

function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", sessionSecret, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch {
    return "";
  }
}

function decrypt(cipherText: string): string {
  try {
    const parts = cipherText.split(":");
    if (parts.length !== 3) return "";
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv("aes-256-gcm", sessionSecret, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours de persistance

interface ActiveSession {
  token: string;
  user: User;
  credentials: {
    username: string;
    password: string;
  };
  lastActive: number;
}

interface StoredSession {
  token: string;
  user: User;
  encPassword: string;
  lastActive: number;
}

interface StoredUserRecord extends User {
  encTotpSecret?: string;
  encGrid?: string;
  preferred2faMethod?: TwoFactorMethod;
}

interface Pending2FAChallenge {
  username: string;
  password: string;
  challenge: any;
  createdAt: number;
}

const PENDING_2FA_TTL_MS = 5 * 60 * 1000;

class AuthService {
  private users: StoredUserRecord[] = [];
  private sessions = new Map<string, ActiveSession>();
  private pending2FA = new Map<string, Pending2FAChallenge>();

  constructor() {
    this.loadUsers();
    this.loadSessions();
  }

  private sanitizeUser(record: StoredUserRecord): User {
    const { encTotpSecret, encGrid, preferred2faMethod, ...publicFields } = record;
    const twoFactor: TwoFactorConfig = {
      preferredMethod: preferred2faMethod || "passcode_grid",
      hasGrid: Boolean(encGrid),
      hasTotp: Boolean(encTotpSecret),
    };
    return { ...publicFields, twoFactor };
  }

  private loadUsers() {
    if (!getMeta("migrated_users_json")) {
      if (fs.existsSync(USERS_FILE)) {
        try {
          const raw = fs.readFileSync(USERS_FILE, "utf-8");
          const parsed: StoredUserRecord[] = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const insertStmt = sqlite.prepare(
              "INSERT OR REPLACE INTO users (username, id, name, role, first_login_at, last_login_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)"
            );
            withTransaction(() => {
              for (const u of parsed) {
                insertStmt.run(
                  u.username,
                  u.id,
                  u.name ?? null,
                  u.role,
                  u.firstLoginAt ?? null,
                  u.lastLoginAt ?? null,
                  JSON.stringify(u)
                );
              }
            });
            console.log(`[+] Migration SQLite users.json : ${parsed.length} utilisateur(s) importé(s).`);
          }
        } catch (e) {
          console.error("[-] Erreur migration users.json vers SQLite :", e);
        }
      }
      setMeta("migrated_users_json", "1");
    }

    try {
      const rows = sqlite.prepare("SELECT data FROM users").all() as Array<{ data: string }>;
      this.users = rows.map((r) => JSON.parse(r.data) as StoredUserRecord);
    } catch (e) {
      console.error("[-] Erreur lecture table users SQLite :", e);
      this.users = [];
    }
  }

  private saveUsers() {
    try {
      const upsertStmt = sqlite.prepare(
        "INSERT OR REPLACE INTO users (username, id, name, role, first_login_at, last_login_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      const keepUsernames = new Set(this.users.map((u) => u.username));
      const existingRows = sqlite.prepare("SELECT username FROM users").all() as Array<{ username: string }>;
      const deleteStmt = sqlite.prepare("DELETE FROM users WHERE username = ?");

      withTransaction(() => {
        for (const row of existingRows) {
          if (!keepUsernames.has(row.username)) {
            deleteStmt.run(row.username);
          }
        }
        for (const u of this.users) {
          upsertStmt.run(
            u.username,
            u.id,
            u.name ?? null,
            u.role,
            u.firstLoginAt ?? null,
            u.lastLoginAt ?? null,
            JSON.stringify(u)
          );
        }
      });
    } catch (e) {
      console.error("[-] Erreur écriture table users SQLite :", e);
    }
  }

  private loadSessions() {
    const now = Date.now();
    if (!getMeta("migrated_sessions_json")) {
      if (fs.existsSync(SESSIONS_FILE)) {
        try {
          const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
          const storedList: StoredSession[] = JSON.parse(raw);
          if (Array.isArray(storedList) && storedList.length > 0) {
            const insertStmt = sqlite.prepare(
              "INSERT OR REPLACE INTO sessions (token, username, enc_password, last_active, user_data) VALUES (?, ?, ?, ?, ?)"
            );
            let imported = 0;
            withTransaction(() => {
              for (const item of storedList) {
                if (now - item.lastActive > SESSION_MAX_AGE_MS) continue;
                insertStmt.run(
                  item.token,
                  item.user.username,
                  item.encPassword,
                  item.lastActive,
                  JSON.stringify(item.user)
                );
                imported++;
              }
            });
            if (imported > 0) {
              console.log(`[+] Migration SQLite sessions.json : ${imported} session(s) importée(s).`);
            }
          }
        } catch (e) {
          console.error("[-] Erreur migration sessions.json vers SQLite :", e);
        }
      }
      setMeta("migrated_sessions_json", "1");
    }

    try {
      sqlite.prepare("DELETE FROM sessions WHERE last_active < ?").run(now - SESSION_MAX_AGE_MS);
      const rows = sqlite
        .prepare("SELECT token, username, enc_password, last_active, user_data FROM sessions")
        .all() as Array<{
        token: string;
        username: string;
        enc_password: string;
        last_active: number;
        user_data: string;
      }>;

      let loadedCount = 0;
      for (const row of rows) {
        if (now - row.last_active > SESSION_MAX_AGE_MS) continue;
        const user = JSON.parse(row.user_data) as User;
        const password = decrypt(row.enc_password);
        this.sessions.set(row.token, {
          token: row.token,
          user,
          credentials: {
            username: user.username,
            password,
          },
          lastActive: row.last_active,
        });
        loadedCount++;
      }
      if (loadedCount > 0) {
        console.log(`[+] ${loadedCount} session(s) active(s) restaurée(s) depuis SQLite.`);
      }
    } catch (e) {
      console.error("[-] Erreur lecture table sessions SQLite :", e);
      this.sessions.clear();
    }
  }

  private saveSessions() {
    try {
      const now = Date.now();
      const upsertStmt = sqlite.prepare(
        "INSERT OR REPLACE INTO sessions (token, username, enc_password, last_active, user_data) VALUES (?, ?, ?, ?, ?)"
      );
      const existingRows = sqlite.prepare("SELECT token FROM sessions").all() as Array<{ token: string }>;
      const deleteStmt = sqlite.prepare("DELETE FROM sessions WHERE token = ?");
      const activeTokens = new Set<string>();

      withTransaction(() => {
        for (const s of this.sessions.values()) {
          if (now - s.lastActive > SESSION_MAX_AGE_MS) continue;
          activeTokens.add(s.token);
          upsertStmt.run(
            s.token,
            s.user.username,
            encrypt(s.credentials.password),
            s.lastActive,
            JSON.stringify(s.user)
          );
        }
        for (const row of existingRows) {
          if (!activeTokens.has(row.token)) {
            deleteStmt.run(row.token);
          }
        }
      });
    } catch (e) {
      console.error("[-] Erreur sauvegarde table sessions SQLite :", e);
    }
  }

  /**
   * Exécute scripts/auth_cas.py en lui passant les paramètres de manière sécurisée via stdin JSON
   */
  private async runAuthCasScript(payload: Record<string, any>): Promise<any> {
    return new Promise((resolve) => {
      const scriptPath = path.resolve(ROOT_DIR, "scripts/auth_cas.py");
      const py = spawn("python", [scriptPath], { cwd: ROOT_DIR });

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
          return resolve({ success: false, error: stderr || "Échec du processus d'authentification CAS." });
        }
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch {
          resolve({ success: false, error: stderr || "Réponse CAS invalide." });
        }
      });

      py.stdin.write(JSON.stringify(payload));
      py.stdin.end();
    });
  }

  private finalizeLoginSession(username: string, password: string, studentName: string): { token: string; user: User } {
    const now = new Date().toISOString();
    let existingUser = this.users.find((u) => u.username === username);

    if (!existingUser) {
      const isFirstUser = this.users.length === 0;
      const role = isFirstUser ? "admin" : "student";

      existingUser = {
        id: "usr_" + crypto.randomBytes(6).toString("hex"),
        username,
        name: studentName,
        role,
        department: "BUT Réseaux & Télécoms - Campus 3",
        firstLoginAt: now,
        lastLoginAt: now,
        preferred2faMethod: "passcode_grid",
      };

      this.users.push(existingUser);
      console.log(`[+] Nouvel utilisateur enregistré : ${username} (Rôle: ${role.toUpperCase()})`);
    } else {
      existingUser.lastLoginAt = now;
      if (studentName && studentName !== username) {
        existingUser.name = studentName;
      }
    }

    this.saveUsers();

    const sanitized = this.sanitizeUser(existingUser);
    const token = crypto.randomBytes(32).toString("hex");
    this.sessions.set(token, {
      token,
      user: sanitized,
      credentials: { username, password },
      lastActive: Date.now(),
    });

    this.saveSessions();

    return { token, user: sanitized };
  }

  /**
   * Connecte un étudiant via le CAS Unicaen (avec résolution auto 2FA si configurée, ou défi interactif)
   */
  public async login(
    usernameInput: string,
    passwordInput: string,
    options?: {
      otpCode?: string;
      preferredMethod?: TwoFactorMethod;
      totpSecret?: string;
      grid?: any;
      save2FA?: boolean;
    }
  ): Promise<AuthResponse> {
    const username = usernameInput.trim().toLowerCase();
    const password = passwordInput;

    if (!username || !password) {
      throw new Error("Identifiant et mot de passe requis.");
    }

    const stored2FA = this.getUser2FASecrets(username);
    const totpSecret = options?.totpSecret || stored2FA?.totpSecret;
    const grid = options?.grid || stored2FA?.grid;
    const preferredMethod = options?.preferredMethod || stored2FA?.preferredMethod || "passcode_grid";

    const casResult = await this.runAuthCasScript({
      action: "login",
      username,
      password,
      totpSecret,
      grid,
      otpCode: options?.otpCode,
      preferredMethod,
    });

    if (casResult.requires2FA) {
      // Nettoyer les anciens défis expirés
      const now = Date.now();
      for (const [k, v] of this.pending2FA.entries()) {
        if (now - v.createdAt > PENDING_2FA_TTL_MS) {
          this.pending2FA.delete(k);
        }
      }

      const challengeId = crypto.randomBytes(16).toString("hex");
      this.pending2FA.set(challengeId, {
        username,
        password,
        challenge: casResult.challenge,
        createdAt: now,
      });

      return {
        requires2FA: true,
        challengeId,
        methods: casResult.methods || ["passcode_grid", "totp"],
        gridCell: (casResult.gridCell as GridCellChallenge) || null,
      };
    }

    if (!casResult.success) {
      throw new Error(casResult.error || "Identifiant ou mot de passe ENT incorrect.");
    }

    const sessionRes = this.finalizeLoginSession(username, password, casResult.name || username);

    if (options?.save2FA && (options.totpSecret || options.grid || options.preferredMethod)) {
      this.updateUser2FA(username, {
        preferredMethod: options.preferredMethod,
        totpSecret: options.totpSecret,
        grid: options.grid,
      });
      const updated = this.users.find((u) => u.username === username);
      if (updated) {
        sessionRes.user = this.sanitizeUser(updated);
      }
    }

    return sessionRes;
  }

  /**
   * Finalise une connexion CAS en attente de code 2FA (Grille ou TOTP)
   */
  public async verify2FA(
    challengeId: string,
    params: {
      method: TwoFactorMethod;
      code?: string;
      totpSecret?: string;
      grid?: any;
      save2FA?: boolean;
    }
  ): Promise<{ token: string; user: User }> {
    const pending = this.pending2FA.get(challengeId);
    if (!pending || Date.now() - pending.createdAt > PENDING_2FA_TTL_MS) {
      this.pending2FA.delete(challengeId);
      throw new Error("Session de validation 2FA expirée. Veuillez vous reconnecter.");
    }

    const res = await this.runAuthCasScript({
      action: "verify_2fa",
      username: pending.username,
      challenge: pending.challenge,
      method: params.method,
      code: params.code,
      totpSecret: params.totpSecret,
      grid: params.grid,
    });

    if (!res.success) {
      throw new Error(res.error || "Code 2FA invalide.");
    }

    this.pending2FA.delete(challengeId);

    const sessionRes = this.finalizeLoginSession(
      pending.username,
      pending.password,
      res.name || pending.username
    );

    if (params.save2FA && (params.totpSecret || params.grid)) {
      const updatedUser = this.updateUser2FA(pending.username, {
        preferredMethod: params.method,
        totpSecret: params.totpSecret,
        grid: params.grid,
      });
      if (updatedUser) {
        sessionRes.user = updatedUser;
      }
    }

    return sessionRes;
  }

  /**
   * Met à jour les paramètres 2FA chiffrés d'un utilisateur
   */
  public updateUser2FA(
    username: string,
    opts: {
      preferredMethod?: TwoFactorMethod;
      totpSecret?: string;
      grid?: any;
      clearTotp?: boolean;
      clearGrid?: boolean;
    }
  ): User | undefined {
    const norm = username.toLowerCase().trim();
    const record = this.users.find((u) => u.username === norm);
    if (!record) return undefined;

    if (opts.preferredMethod) {
      record.preferred2faMethod = opts.preferredMethod;
    }
    if (opts.clearTotp) {
      delete record.encTotpSecret;
    } else if (opts.totpSecret && opts.totpSecret.trim()) {
      record.encTotpSecret = encrypt(opts.totpSecret.trim());
    }

    if (opts.clearGrid) {
      delete record.encGrid;
    } else if (opts.grid) {
      const serialized = typeof opts.grid === "string" ? opts.grid : JSON.stringify(opts.grid);
      if (serialized.trim()) {
        record.encGrid = encrypt(serialized);
      }
    }

    this.saveUsers();

    const sanitized = this.sanitizeUser(record);
    for (const s of this.sessions.values()) {
      if (s.user.username === norm) {
        s.user = sanitized;
      }
    }
    this.saveSessions();

    return sanitized;
  }

  /**
   * Retourne les secrets 2FA déchiffrés côté serveur uniquement (pour les scrapers auto)
   */
  public getUser2FASecrets(username: string): {
    preferredMethod: TwoFactorMethod;
    totpSecret?: string;
    grid?: any;
  } | undefined {
    const norm = username.toLowerCase().trim();
    const record = this.users.find((u) => u.username === norm);
    if (!record) return undefined;

    const totpSecret = record.encTotpSecret ? decrypt(record.encTotpSecret) : undefined;
    let grid: any = undefined;
    if (record.encGrid) {
      const rawGrid = decrypt(record.encGrid);
      if (rawGrid) {
        try {
          grid = JSON.parse(rawGrid);
        } catch {
          grid = rawGrid;
        }
      }
    }

    return {
      preferredMethod: record.preferred2faMethod || "passcode_grid",
      totpSecret: totpSecret || undefined,
      grid,
    };
  }

  /**
   * Récupère la session active par jeton
   */
  public getSession(token: string): ActiveSession | undefined {
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session) return undefined;

    const record = this.users.find((u) => u.username === session.user.username);
    if (record) {
      session.user = this.sanitizeUser(record);
    }

    session.lastActive = Date.now();
    return session;
  }

  /**
   * Récupère les identifiants ENT de session de l'utilisateur actif
   */
  public getUserCredentials(token: string): { username: string; password: string } | undefined {
    const session = this.getSession(token);
    return session ? session.credentials : undefined;
  }

  /**
   * Retourne la liste dédupliquée des utilisateurs actifs disposant d'identifiants ENT en session
   */
  public getActiveUsersWithCredentials(): Array<{ username: string; password: string }> {
    const byUser = new Map<string, { username: string; password: string }>();
    for (const session of this.sessions.values()) {
      const u = session.credentials?.username;
      const p = session.credentials?.password;
      if (u && p && !byUser.has(u)) {
        byUser.set(u, { username: u, password: p });
      }
    }
    return Array.from(byUser.values());
  }

  /**
   * Clôture une session
   */
  public logout(token: string): boolean {
    const deleted = this.sessions.delete(token);
    this.saveSessions();
    return deleted;
  }

  /**
   * Enregistre l'acceptation des conditions d'utilisation et de la décharge de responsabilité
   */
  public acceptTerms(username: string, version = "1.0"): User | undefined {
    const user = this.users.find((u) => u.username === username);
    if (!user) return undefined;

    user.termsAcceptedAt = new Date().toISOString();
    user.termsVersion = version;
    this.saveUsers();

    // Mettre à jour dans toutes les sessions actives en mémoire
    for (const session of this.sessions.values()) {
      if (session.user.username === username) {
        session.user.termsAcceptedAt = user.termsAcceptedAt;
        session.user.termsVersion = user.termsVersion;
      }
    }

    this.saveSessions();

    return user;
  }

  /**
   * Retourne la liste de tous les utilisateurs pour l'administrateur
   */
  public getAllUsers(): AdminUserSummary[] {
    return this.users.map((u) => {
      const norm = u.username.toLowerCase().trim();
      let notesCount = 0;
      if (hasUserInSqlite(norm)) {
        notesCount = countUserNotes(norm);
      } else {
        const legacyFile = path.resolve(DATA_DIR, "users", u.username, "database.json");
        if (fs.existsSync(legacyFile)) {
          try {
            const raw = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
            notesCount = raw.notes?.length || 0;
          } catch {}
        }
      }

      return {
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        firstLoginAt: u.firstLoginAt,
        lastLoginAt: u.lastLoginAt,
        notesCount,
        termsAcceptedAt: u.termsAcceptedAt,
      };
    });
  }

  /**
   * Indique si un utilisateur est administrateur
   */
  public isAdmin(token: string): boolean {
    const session = this.getSession(token);
    return session ? session.user.role === "admin" : false;
  }

  /**
   * Supprime définitivement le compte d'un utilisateur et toutes ses données associées (Conformité RGPD)
   */
  public deleteAccount(username: string): boolean {
    const norm = username.toLowerCase().trim();

    // 1. Fermer toutes les sessions actives de l'utilisateur
    for (const [token, session] of this.sessions.entries()) {
      if (session.user.username.toLowerCase() === norm) {
        this.sessions.delete(token);
      }
    }

    // 2. Retirer de la liste users.json
    const initialLen = this.users.length;
    this.users = this.users.filter((u) => u.username.toLowerCase() !== norm);
    this.saveUsers();
    this.saveSessions();

    // 3. Supprimer le dossier de données de l'utilisateur sur le disque
    deleteUserDb(norm);

    console.log(`[+] Compte et données de ${norm} supprimés avec succès (RGPD).`);
    return this.users.length !== initialLen;
  }
}

export const authService = new AuthService();
