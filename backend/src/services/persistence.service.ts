import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { createLogger } from './logging.service';
import { Session } from '../shared/types';
import { SessionNotFoundError } from '../shared/errors';

const log = createLogger('PersistenceService');

let db: Database.Database;

/**
 * Initialize SQLite database and create tables if they don't exist.
 */
export function initDatabase(): void {
  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.db.path);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      status TEXT NOT NULL,
      repository TEXT NOT NULL,
      issue_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
  `);

  log.info('Database initialized', { path: config.db.path });
}

/**
 * Save a session (insert or update).
 */
export function saveSession(session: Session): void {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, data, status, repository, issue_number, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    session.id,
    JSON.stringify(session),
    session.status,
    session.repository.fullName,
    session.issue.number,
    session.createdAt,
    session.updatedAt
  );
}

/**
 * Get a session by ID.
 */
export function getSession(sessionId: string): Session {
  const stmt = db.prepare('SELECT data FROM sessions WHERE id = ?');
  const row = stmt.get(sessionId) as { data: string } | undefined;

  if (!row) {
    throw new SessionNotFoundError(sessionId);
  }

  return JSON.parse(row.data) as Session;
}

/**
 * List sessions, optionally filtered by status, ordered by most recent.
 */
export function listSessions(options: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): { sessions: Session[]; total: number } {
  const { status, limit = 20, offset = 0 } = options;

  let countQuery = 'SELECT COUNT(*) as total FROM sessions';
  let dataQuery = 'SELECT data FROM sessions';
  const params: any[] = [];

  if (status) {
    countQuery += ' WHERE status = ?';
    dataQuery += ' WHERE status = ?';
    params.push(status);
  }

  dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const countRow = db.prepare(countQuery).get(...params) as { total: number };
  const rows = db.prepare(dataQuery).all(...params, limit, offset) as { data: string }[];

  return {
    sessions: rows.map((r) => JSON.parse(r.data) as Session),
    total: countRow.total,
  };
}

/**
 * Delete a session.
 */
export function deleteSession(sessionId: string): void {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(sessionId);

  if (result.changes === 0) {
    throw new SessionNotFoundError(sessionId);
  }
}

/**
 * Delete all sessions (clear history).
 */
export function deleteAllSessions(): void {
  const stmt = db.prepare('DELETE FROM sessions');
  stmt.run();
}

/**
 * Get the database instance (for LangGraph checkpoint storage).
 */
export function getDatabase(): Database.Database {
  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    log.info('Database connection closed');
  }
}
