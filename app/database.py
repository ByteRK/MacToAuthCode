import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pid TEXT NOT NULL,
    code TEXT NOT NULL,
    source_batch TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    assigned_mac TEXT,
    assigned_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distribution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pid TEXT NOT NULL,
    mac TEXT NOT NULL,
    code TEXT,
    action TEXT NOT NULL,
    message TEXT,
    client_ip TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_codes_pid_code ON auth_codes(pid, code);
CREATE INDEX IF NOT EXISTS idx_auth_codes_pid_status ON auth_codes(pid, status);
CREATE INDEX IF NOT EXISTS idx_auth_codes_pid_assigned_mac ON auth_codes(pid, assigned_mac);
CREATE INDEX IF NOT EXISTS idx_distribution_logs_pid_mac ON distribution_logs(pid, mac);
"""


class Database:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def initialize(self) -> None:
        with self.connection() as conn:
            self._migrate_auth_codes(conn)
            self._migrate_distribution_logs(conn)
            conn.executescript(SCHEMA_SQL)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return {row["name"] for row in rows}

    def _migrate_auth_codes(self, conn: sqlite3.Connection) -> None:
        columns = self._table_columns(conn, "auth_codes")
        if not columns:
            return
        if "pid" in columns:
            return

        conn.executescript(
            """
            ALTER TABLE auth_codes RENAME TO auth_codes_legacy;

            CREATE TABLE auth_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pid TEXT NOT NULL,
                code TEXT NOT NULL,
                source_batch TEXT,
                status TEXT NOT NULL DEFAULT 'available',
                assigned_mac TEXT,
                assigned_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO auth_codes (
                id, pid, code, source_batch, status, assigned_mac, assigned_at, created_at, updated_at
            )
            SELECT
                id,
                'default',
                code,
                source_batch,
                status,
                assigned_mac,
                assigned_at,
                created_at,
                updated_at
            FROM auth_codes_legacy;

            DROP TABLE auth_codes_legacy;
            """
        )

    def _migrate_distribution_logs(self, conn: sqlite3.Connection) -> None:
        columns = self._table_columns(conn, "distribution_logs")
        if not columns:
            return
        if "pid" in columns:
            return

        conn.executescript(
            """
            ALTER TABLE distribution_logs RENAME TO distribution_logs_legacy;

            CREATE TABLE distribution_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pid TEXT NOT NULL,
                mac TEXT NOT NULL,
                code TEXT,
                action TEXT NOT NULL,
                message TEXT,
                client_ip TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO distribution_logs (
                id, pid, mac, code, action, message, client_ip, created_at
            )
            SELECT
                id,
                'default',
                mac,
                code,
                action,
                message,
                client_ip,
                created_at
            FROM distribution_logs_legacy;

            DROP TABLE distribution_logs_legacy;
            """
        )
