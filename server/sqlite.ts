import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, "../data");
export const SQLITE_DB_PATH = path.resolve(DATA_DIR, "backpack.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const sqlite = new DatabaseSync(SQLITE_DB_PATH, { timeout: 5000 });

sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL,
    first_login_at TEXT,
    last_login_at TEXT,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    enc_password TEXT NOT NULL,
    last_active INTEGER NOT NULL,
    user_data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username);
  CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active);

  CREATE TABLE IF NOT EXISTS user_meta (
    username TEXT PRIMARY KEY,
    initialized INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_kv (
    username TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, key)
  );

  CREATE TABLE IF NOT EXISTS resources (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    semester INTEGER,
    category TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );
  CREATE INDEX IF NOT EXISTS idx_notes_user_res_type ON notes(username, resource_id, type);

  CREATE TABLE IF NOT EXISTS assets (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    note_id TEXT,
    file_name TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );
  CREATE INDEX IF NOT EXISTS idx_assets_user_note ON assets(username, note_id);

  CREATE TABLE IF NOT EXISTS schedule_events (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    matched_code TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );
  CREATE INDEX IF NOT EXISTS idx_schedule_user_start ON schedule_events(username, start_at);

  CREATE TABLE IF NOT EXISTS recent_grades (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    resource_code TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    detected_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id, resource_code)
  );

  CREATE TABLE IF NOT EXISTS schedule_changes (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    event_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    detected_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );

  CREATE TABLE IF NOT EXISTS sticky_notes (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    resource_code TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );

  CREATE TABLE IF NOT EXISTS lessons (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    resource_code TEXT,
    due_date TEXT,
    is_completed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );

  CREATE TABLE IF NOT EXISTS slides (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    resource_code TEXT,
    updated_at TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );

  CREATE TABLE IF NOT EXISTS qcms (
    username TEXT NOT NULL,
    id TEXT NOT NULL,
    resource_code TEXT,
    updated_at TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, id)
  );

  CREATE TABLE IF NOT EXISTS authorized_senders (
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL,
    added_at TEXT,
    PRIMARY KEY (username, email)
  );

  CREATE TABLE IF NOT EXISTS mail_triage (
    username TEXT NOT NULL,
    message_key TEXT NOT NULL,
    priority TEXT NOT NULL,
    category TEXT NOT NULL,
    action_required INTEGER NOT NULL DEFAULT 0,
    should_notify INTEGER,
    summary_version INTEGER,
    triaged_at TEXT,
    data TEXT NOT NULL,
    PRIMARY KEY (username, message_key)
  );
  CREATE INDEX IF NOT EXISTS idx_mail_triage_user_prio ON mail_triage(username, priority);

  CREATE TABLE IF NOT EXISTS mail_cache (
    username TEXT NOT NULL,
    folder TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    is_full_list INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    PRIMARY KEY (username, folder)
  );
`);

let txDepth = 0;

/**
 * Exécute une fonction dans une transaction SQLite (supporte l'imbrication via SAVEPOINT).
 */
export function withTransaction<T>(fn: () => T): T {
  const depth = txDepth++;
  const spName = `sp_${depth}`;
  if (depth === 0) {
    sqlite.exec("BEGIN IMMEDIATE");
  } else {
    sqlite.exec(`SAVEPOINT ${spName}`);
  }
  try {
    const result = fn();
    if (depth === 0) {
      sqlite.exec("COMMIT");
    } else {
      sqlite.exec(`RELEASE SAVEPOINT ${spName}`);
    }
    return result;
  } catch (err) {
    try {
      if (depth === 0) {
        sqlite.exec("ROLLBACK");
      } else {
        sqlite.exec(`ROLLBACK TO SAVEPOINT ${spName}`);
        sqlite.exec(`RELEASE SAVEPOINT ${spName}`);
      }
    } catch {}
    throw err;
  } finally {
    txDepth--;
  }
}

const getMetaStmt = sqlite.prepare("SELECT value FROM meta WHERE key = ?");
const setMetaStmt = sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
const deleteMetaStmt = sqlite.prepare("DELETE FROM meta WHERE key = ?");

export function getMeta(key: string): string | undefined {
  const row = getMetaStmt.get(key) as { value?: string } | undefined;
  return row?.value;
}

export function setMeta(key: string, value: string): void {
  setMetaStmt.run(key, value);
}

const hasUserStmt = sqlite.prepare("SELECT 1 AS ok FROM user_meta WHERE username = ?");
export function hasUserInSqlite(username: string): boolean {
  const row = hasUserStmt.get(username) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

const countNotesStmt = sqlite.prepare("SELECT COUNT(*) AS count FROM notes WHERE username = ?");
export function countUserNotes(username: string): number {
  const row = countNotesStmt.get(username) as { count?: number } | undefined;
  return Number(row?.count || 0);
}

const USER_SCOPED_TABLES = [
  "user_meta",
  "user_kv",
  "resources",
  "notes",
  "assets",
  "schedule_events",
  "recent_grades",
  "schedule_changes",
  "sticky_notes",
  "lessons",
  "slides",
  "qcms",
  "authorized_senders",
  "mail_triage",
  "mail_cache",
] as const;

export function deleteAllUserSqliteData(username: string): void {
  const norm = username.toLowerCase().trim();
  const safeUser = norm.replace(/[^a-z0-9_.-]/g, "_");
  withTransaction(() => {
    for (const table of USER_SCOPED_TABLES) {
      sqlite.prepare(`DELETE FROM ${table} WHERE username = ?`).run(norm);
    }
    deleteMetaStmt.run(`migrated_mail_triage:${norm}`);
    deleteMetaStmt.run(`migrated_mail_cache:${norm}`);
    if (safeUser !== norm) {
      for (const table of USER_SCOPED_TABLES) {
        sqlite.prepare(`DELETE FROM ${table} WHERE username = ?`).run(safeUser);
      }
      deleteMetaStmt.run(`migrated_mail_triage:${safeUser}`);
      deleteMetaStmt.run(`migrated_mail_cache:${safeUser}`);
    }
  });
}
