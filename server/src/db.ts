import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const dbPath = process.env.DATABASE_URL || './data/scatterbrain.db';

try {
  mkdirSync(dirname(dbPath), { recursive: true });
} catch {}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_name TEXT NOT NULL,
      receipt_date TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Other',
      client_name TEXT DEFAULT '',
      line_items TEXT,
      raw_line_items TEXT,
      tax_lines TEXT,
      image_path TEXT,
      image_url TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanned_at TEXT DEFAULT (datetime('now')),
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      model TEXT DEFAULT '',
      success INTEGER DEFAULT 1
    );
  `);

  // Migrations for existing databases
  try { sqlite.exec(`ALTER TABLE receipts ADD COLUMN client_name TEXT DEFAULT ''`); } catch {}
  try { sqlite.exec(`ALTER TABLE receipts ADD COLUMN raw_line_items TEXT`); } catch {}

  console.log('Database initialized');
}
