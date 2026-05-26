import hashlib
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pid TEXT NOT NULL,
    did TEXT NOT NULL,
    license TEXT NOT NULL,
    code TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
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
    payload_json TEXT,
    action TEXT NOT NULL,
    message TEXT,
    client_ip TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_codes_pid_payload_hash ON auth_codes(pid, payload_hash);
CREATE INDEX IF NOT EXISTS idx_auth_codes_did ON auth_codes(did);
CREATE INDEX IF NOT EXISTS idx_auth_codes_pid_did ON auth_codes(pid, did);
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
        if {"pid", "did", "license", "payload_json", "payload_hash"}.issubset(columns):
            return

        conn.execute("ALTER TABLE auth_codes RENAME TO auth_codes_legacy")
        conn.executescript(
            """
            CREATE TABLE auth_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pid TEXT NOT NULL,
                did TEXT NOT NULL,
                license TEXT NOT NULL,
                code TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                payload_hash TEXT NOT NULL,
                source_batch TEXT,
                status TEXT NOT NULL DEFAULT 'available',
                assigned_mac TEXT,
                assigned_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        legacy_columns = self._table_columns(conn, "auth_codes_legacy")
        legacy_rows = conn.execute("SELECT * FROM auth_codes_legacy").fetchall()
        for row in legacy_rows:
            pid = row["pid"] if "pid" in legacy_columns else "default"
            code = row["code"] if "code" in legacy_columns else ""
            payload_json = (
                row["payload_json"]
                if "payload_json" in legacy_columns
                else json.dumps({"auth_code": code}, ensure_ascii=False, sort_keys=True)
            )
            payload = json.loads(payload_json or "{}")
            did = (
                row["did"]
                if "did" in legacy_columns and row["did"]
                else self._extract_payload_value(payload, "did") or code
            )
            license_value = (
                row["license"]
                if "license" in legacy_columns and row["license"]
                else self._extract_payload_value(payload, "license") or code
            )
            payload_hash = (
                row["payload_hash"]
                if "payload_hash" in legacy_columns
                else hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO auth_codes (
                    id, pid, did, license, code, payload_json, payload_hash, source_batch,
                    status, assigned_mac, assigned_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    pid,
                    did,
                    license_value,
                    code,
                    payload_json,
                    payload_hash,
                    row["source_batch"] if "source_batch" in legacy_columns else None,
                    row["status"] if "status" in legacy_columns else "available",
                    row["assigned_mac"] if "assigned_mac" in legacy_columns else None,
                    row["assigned_at"] if "assigned_at" in legacy_columns else None,
                    row["created_at"] if "created_at" in legacy_columns else None,
                    row["updated_at"] if "updated_at" in legacy_columns else None,
                ),
            )

        conn.execute("DROP TABLE auth_codes_legacy")

    def _migrate_distribution_logs(self, conn: sqlite3.Connection) -> None:
        columns = self._table_columns(conn, "distribution_logs")
        if not columns:
            return
        if {"pid", "payload_json"}.issubset(columns):
            return

        conn.execute("ALTER TABLE distribution_logs RENAME TO distribution_logs_legacy")
        conn.executescript(
            """
            CREATE TABLE distribution_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pid TEXT NOT NULL,
                mac TEXT NOT NULL,
                code TEXT,
                payload_json TEXT,
                action TEXT NOT NULL,
                message TEXT,
                client_ip TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        legacy_columns = self._table_columns(conn, "distribution_logs_legacy")
        legacy_rows = conn.execute("SELECT * FROM distribution_logs_legacy").fetchall()
        for row in legacy_rows:
            conn.execute(
                """
                INSERT INTO distribution_logs (
                    id, pid, mac, code, payload_json, action, message, client_ip, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    row["pid"] if "pid" in legacy_columns else "default",
                    row["mac"],
                    row["code"] if "code" in legacy_columns else None,
                    row["payload_json"] if "payload_json" in legacy_columns else None,
                    row["action"],
                    row["message"] if "message" in legacy_columns else None,
                    row["client_ip"] if "client_ip" in legacy_columns else None,
                    row["created_at"] if "created_at" in legacy_columns else None,
                ),
            )
        conn.execute("DROP TABLE distribution_logs_legacy")

    @staticmethod
    def _extract_payload_value(payload: dict, field_name: str) -> str:
        if field_name in payload and payload[field_name]:
            return str(payload[field_name])
        lower_field = field_name.lower()
        for key, value in payload.items():
            if key.lower() == lower_field and value:
                return str(value)
        return ""
