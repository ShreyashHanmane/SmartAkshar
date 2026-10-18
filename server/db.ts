import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Local database: one SQLite file. Every user-owned table carries user_id and
 * every query in server/routes filters on it.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    json TEXT NOT NULL
  );
  CREATE TABLE subjects (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE notebooks (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    subject_id TEXT,
    mode TEXT NOT NULL DEFAULT 'paged',
    paper TEXT NOT NULL DEFAULT 'dots',
    background TEXT NOT NULL DEFAULT 'white',
    page_count INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE pages (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notebook_id TEXT NOT NULL,
    id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    elements TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, notebook_id, id)
  );
  CREATE TABLE notes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notebook_id TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, notebook_id)
  );
  CREATE TABLE activity (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    seconds INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE files (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL,
    owner_ref TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, name)
  );
  CREATE TABLE books (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    format TEXT NOT NULL,
    size INTEGER NOT NULL,
    file TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    progress REAL NOT NULL DEFAULT 0,
    position TEXT NOT NULL DEFAULT '{}',
    notebook_id TEXT,
    created_at INTEGER NOT NULL,
    opened_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE highlights (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL,
    id TEXT NOT NULL,
    section INTEGER NOT NULL,
    exact TEXT NOT NULL,
    prefix TEXT NOT NULL,
    suffix TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE cards (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    deck_id TEXT,
    due INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  `,
  // v2: flashcard decks and full card fields.
  `
  CREATE TABLE decks (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    subject_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  ALTER TABLE cards ADD COLUMN front TEXT NOT NULL DEFAULT '';
  ALTER TABLE cards ADD COLUMN back TEXT NOT NULL DEFAULT '';
  ALTER TABLE cards ADD COLUMN box INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE cards ADD COLUMN reviews INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE cards ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE cards ADD COLUMN last_reviewed INTEGER;
  ALTER TABLE cards ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE cards ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX cards_deck ON cards(user_id, deck_id);
  CREATE INDEX cards_due ON cards(user_id, due);
  `,
];

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const version = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}

/** Runs `fn` in a transaction. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
