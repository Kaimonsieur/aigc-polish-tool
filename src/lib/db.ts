import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultCardPointsForRole } from "@/lib/cards";
import { hashCardCode, normalizeCardCode, previewCode } from "@/lib/security";

type SqlValue = string | number | null | Buffer | bigint;

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "aigc-polish.sqlite");

let db: DatabaseSync | null = null;

function runMigrations(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      points INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS card_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      points INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      validity_days INTEGER,
      expires_at TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redeem_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      code_preview TEXT NOT NULL,
      points INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      validity_days INTEGER,
      status TEXT NOT NULL DEFAULT 'unused',
      redeemed_by INTEGER,
      redeemed_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(batch_id) REFERENCES card_batches(id),
      FOREIGN KEY(redeemed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS credit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      change_points INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      type TEXT NOT NULL,
      ref_type TEXT,
      ref_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS rewrite_tasks (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      source_type TEXT NOT NULL,
      input_chars INTEGER NOT NULL,
      cost_points INTEGER NOT NULL,
      used_free INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      input_text TEXT NOT NULL,
      output_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS free_daily (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, day),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      provider TEXT NOT NULL,
      model TEXT,
      input_chars INTEGER NOT NULL,
      output_chars INTEGER,
      duration_ms INTEGER,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      chars INTEGER NOT NULL,
      extracted_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS aigc_detection_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      chars INTEGER NOT NULL,
      percent INTEGER NOT NULL,
      label TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      detail TEXT NOT NULL,
      request_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(task_id) REFERENCES rewrite_tasks(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  try {
    database.exec("ALTER TABLE card_batches ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  } catch {
    // Existing databases already have this column.
  }

  try {
    database.exec("ALTER TABLE redeem_cards ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  } catch {
    // Existing databases already have this column.
  }

  try {
    database.exec("ALTER TABLE users ADD COLUMN expires_at TEXT");
  } catch {
    // Existing databases already have this column.
  }

  try {
    database.exec("ALTER TABLE card_batches ADD COLUMN validity_days INTEGER");
  } catch {
    // Existing databases already have this column.
  }

  try {
    database.exec("ALTER TABLE redeem_cards ADD COLUMN validity_days INTEGER");
  } catch {
    // Existing databases already have this column.
  }
}

function bootstrapAdminCard(database: DatabaseSync) {
  const rawCode = process.env.BOOTSTRAP_ADMIN_CARD;
  if (!rawCode) {
    return;
  }

  const code = normalizeCardCode(rawCode);
  if (!code || code.includes("REPLACE") || code.includes("CHANGE-ME")) {
    return;
  }

  const codeHash = hashCardCode(code);
  const existing = database.prepare("SELECT id FROM redeem_cards WHERE code_hash = ?").get(codeHash);
  if (existing) {
    return;
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const batch = database
      .prepare(
        `INSERT INTO card_batches (name, points, quantity, role, validity_days, expires_at, created_by)
         VALUES (?, ?, 1, 'admin', NULL, NULL, NULL)`,
      )
      .run("Bootstrap admin card", defaultCardPointsForRole("admin", 0));
    database
      .prepare(
        `INSERT INTO redeem_cards (batch_id, code_hash, code_preview, points, role, validity_days, expires_at)
         VALUES (?, ?, ?, ?, 'admin', NULL, NULL)`,
      )
      .run(Number(batch.lastInsertRowid), codeHash, previewCode(code), defaultCardPointsForRole("admin", 0));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getDb() {
  if (!db) {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(dbPath);
    runMigrations(db);
    bootstrapAdminCard(db);
  }

  return db;
}

export function getOne<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]) {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function getAll<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]) {
  return getDb().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: SqlValue[]) {
  return getDb().prepare(sql).run(...params);
}
