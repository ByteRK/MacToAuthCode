import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pid TEXT NOT NULL,
  did TEXT NOT NULL,
  license TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_batch TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','assigned')),
  assigned_mac TEXT,
  assigned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pid, did)
);
CREATE INDEX IF NOT EXISTS idx_codes_pid_status ON auth_codes(pid, status, id);
CREATE INDEX IF NOT EXISTS idx_codes_pid_mac ON auth_codes(pid, assigned_mac);
CREATE TABLE IF NOT EXISTS pid_metadata (
  pid TEXT PRIMARY KEY,
  remark TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  pid TEXT,
  mac TEXT,
  did TEXT,
  client_ip TEXT,
  message TEXT NOT NULL,
  snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '2');
`

export class Database {
  readonly raw: DatabaseSync
  constructor(path: string) {
    this.raw = new DatabaseSync(path)
    this.raw.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000;')
    this.raw.exec(SCHEMA)
  }
  transaction<T>(work: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE')
    try { const result = work(); this.raw.exec('COMMIT'); return result }
    catch (error) { this.raw.exec('ROLLBACK'); throw error }
  }
  close() { this.raw.close() }
}
