import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// src/modules/sqlite -> project root is three levels up
const ROOT = path.resolve(import.meta.dirname, '../../..');
const DB_PATH = process.env.SQLITE_PATH || path.join(ROOT, 'data', 'app.db');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Applies migrations/*.sql in filename order, once each. Write them to be re-runnable
// (CREATE TABLE IF NOT EXISTS) so a half-finished deploy can't break startup.
export function migrate() {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file);
    })();
    console.log(`[sqlite] applied ${file}`);
  }
}

migrate();

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(key, String(value));
}

export function register(app) {
  app.locals.db = db;
}
