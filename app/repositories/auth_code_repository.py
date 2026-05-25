import json
from collections.abc import Iterable
from typing import Any

from app.database import Database


class AuthCodeRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def find_assigned_by_mac(self, conn, pid: str, mac: str) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT pid, did, license, code, payload_json, assigned_mac, assigned_at, source_batch
            FROM auth_codes
            WHERE pid = ? AND assigned_mac = ?
            LIMIT 1
            """,
            (pid, mac),
        ).fetchone()
        return self._decode_row(row) if row else None

    def claim_next_available_code(self, conn, pid: str, mac: str) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT id, pid, did, license, code, payload_json, source_batch
            FROM auth_codes
            WHERE pid = ? AND status = 'available'
            ORDER BY id ASC
            LIMIT 1
            """,
            (pid,),
        ).fetchone()
        if row is None:
            return None

        updated = conn.execute(
            """
            UPDATE auth_codes
            SET status = 'assigned',
                assigned_mac = ?,
                assigned_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND pid = ? AND status = 'available'
            """,
            (mac, row["id"], pid),
        )
        if updated.rowcount != 1:
            return None

        assigned = conn.execute(
            """
            SELECT pid, did, license, code, payload_json, assigned_mac, assigned_at, source_batch
            FROM auth_codes
            WHERE id = ?
            """,
            (row["id"],),
        ).fetchone()
        return self._decode_row(assigned) if assigned else None

    def log_distribution(
        self,
        conn,
        *,
        pid: str,
        mac: str,
        action: str,
        message: str,
        client_ip: str | None,
        code: str | None = None,
        payload_json: str | None = None,
    ) -> None:
        conn.execute(
            """
            INSERT INTO distribution_logs (pid, mac, code, payload_json, action, message, client_ip)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (pid, mac, code, payload_json, action, message, client_ip),
        )

    def bulk_insert_codes(self, rows: Iterable[dict[str, str]]) -> dict[str, int]:
        inserted = 0
        skipped = 0
        warnings: list[str] = []
        duplicate_keys: list[str] = []
        row_list = list(rows)
        if not row_list:
            return {"inserted": 0, "skipped": 0, "warnings": []}

        file_duplicate_keys = self._collect_duplicate_pid_dids(row_list)
        if file_duplicate_keys:
            duplicate_keys.extend(sorted(file_duplicate_keys))
            warnings.append(
                f"以下 PID + DID 在本次导入文件中重复，已跳过重复记录：{', '.join(sorted(file_duplicate_keys))}"
            )

        with self.database.connection() as conn:
            existing_keys = self.find_existing_pid_dids(
                conn,
                [
                    (row["pid"], row["did"])
                    for row in row_list
                    if row.get("pid") and row.get("did")
                ],
            )
            if existing_keys:
                duplicate_keys.extend(sorted(existing_keys))
                warnings.append(
                    f"以下 PID + DID 已存在库存中，导入时已跳过：{', '.join(sorted(existing_keys))}"
                )

            seen_keys: set[tuple[str, str]] = set()
            for row in row_list:
                key = (row["pid"], row["did"])
                if self._format_pid_did(*key) in existing_keys or key in seen_keys:
                    skipped += 1
                    continue
                seen_keys.add(key)
                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO auth_codes (
                        pid, did, license, code, payload_json, payload_hash, source_batch
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["pid"],
                        row["did"],
                        row["license"],
                        row["code"],
                        row["payload_json"],
                        row["payload_hash"],
                        row.get("source_batch"),
                    ),
                )
                if cursor.rowcount == 1:
                    inserted += 1
                else:
                    skipped += 1
        return {
            "inserted": inserted,
            "skipped": skipped,
            "duplicate_records": sorted(set(duplicate_keys)),
            "warnings": warnings,
        }

    def fetch_summary(self) -> dict[str, int]:
        with self.database.connection() as conn:
            total = conn.execute("SELECT COUNT(*) FROM auth_codes").fetchone()[0]
            available = conn.execute(
                "SELECT COUNT(*) FROM auth_codes WHERE status = 'available'"
            ).fetchone()[0]
            assigned = conn.execute(
                "SELECT COUNT(*) FROM auth_codes WHERE status = 'assigned'"
            ).fetchone()[0]
            pids = conn.execute(
                "SELECT COUNT(DISTINCT pid) FROM auth_codes"
            ).fetchone()[0]
            logs = conn.execute("SELECT COUNT(*) FROM distribution_logs").fetchone()[0]
        return {
            "total_codes": total,
            "available_codes": available,
            "assigned_codes": assigned,
            "pid_count": pids,
            "distribution_requests": logs,
        }

    def fetch_recent_logs(
        self,
        *,
        limit: int = 20,
        action: str = "all",
    ) -> list[dict[str, Any]]:
        where_sql, params = self._build_log_filters(action)
        with self.database.connection() as conn:
            rows = conn.execute(
                f"""
                SELECT id AS log_id, pid, mac, code, payload_json, action, message, client_ip, created_at
                FROM distribution_logs
                {where_sql}
                ORDER BY id DESC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()
        return [self._decode_log_row(row) for row in rows]

    def list_logs_for_export(self, *, action: str = "all") -> list[dict[str, Any]]:
        where_sql, params = self._build_log_filters(action)
        with self.database.connection() as conn:
            rows = conn.execute(
                f"""
                SELECT id AS log_id, pid, mac, code, payload_json, action, message, client_ip, created_at
                FROM distribution_logs
                {where_sql}
                ORDER BY id DESC
                """,
                params,
            ).fetchall()
        return [self._decode_log_row(row) for row in rows]

    def list_allocations(
        self,
        *,
        search: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        offset = (page - 1) * page_size
        keyword = f"%{search.strip()}%" if search else "%"
        with self.database.connection() as conn:
            total = conn.execute(
                """
                SELECT COUNT(*)
                FROM auth_codes
                WHERE status = 'assigned'
                  AND (
                    pid LIKE ? OR assigned_mac LIKE ? OR did LIKE ? OR code LIKE ? OR payload_json LIKE ?
                  )
                """,
                (keyword, keyword, keyword, keyword, keyword),
            ).fetchone()[0]
            rows = conn.execute(
                """
                SELECT pid, did, license, code, payload_json, assigned_mac, assigned_at, source_batch
                FROM auth_codes
                WHERE status = 'assigned'
                  AND (
                    pid LIKE ? OR assigned_mac LIKE ? OR did LIKE ? OR code LIKE ? OR payload_json LIKE ?
                  )
                ORDER BY assigned_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (keyword, keyword, keyword, keyword, keyword, page_size, offset),
            ).fetchall()
        return {
            "items": [self._decode_row(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def list_codes(
        self,
        *,
        pid: str = "",
        status: str = "all",
        search: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        clauses = []
        params: list[Any] = []
        if pid:
            clauses.append("pid = ?")
            params.append(pid)
        if status in {"available", "assigned"}:
            clauses.append("status = ?")
            params.append(status)
        if search:
            clauses.append(
                """
                (pid LIKE ? OR did LIKE ? OR code LIKE ?
                 OR COALESCE(assigned_mac, '') LIKE ? OR payload_json LIKE ?)
                """
            )
            keyword = f"%{search.strip()}%"
            params.extend([keyword, keyword, keyword, keyword, keyword])

        where_sql = " AND ".join(clauses) if clauses else "1=1"
        offset = (page - 1) * page_size
        with self.database.connection() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM auth_codes WHERE {where_sql}",
                params,
            ).fetchone()[0]
            rows = conn.execute(
                f"""
                SELECT
                    pid, did, license, code, payload_json, source_batch,
                    status, assigned_mac, assigned_at, created_at
                FROM auth_codes
                WHERE {where_sql}
                ORDER BY id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, page_size, offset],
            ).fetchall()
        return {
            "items": [self._decode_row(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def summarize_inventory_by_pid(
        self,
        *,
        search: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        offset = (page - 1) * page_size
        params: list[Any] = []
        where_sql = "1=1"
        if search:
            where_sql = "pid LIKE ?"
            params.append(f"%{search.strip()}%")

        with self.database.connection() as conn:
            total = conn.execute(
                f"SELECT COUNT(DISTINCT pid) FROM auth_codes WHERE {where_sql}",
                params,
            ).fetchone()[0]
            rows = conn.execute(
                f"""
                SELECT
                    pid,
                    COUNT(*) AS total_codes,
                    SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_codes,
                    SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assigned_codes,
                    MIN(did) AS sample_did,
                    MAX(assigned_at) AS last_assigned_at
                FROM auth_codes
                WHERE {where_sql}
                GROUP BY pid
                ORDER BY pid ASC
                LIMIT ? OFFSET ?
                """,
                [*params, page_size, offset],
            ).fetchall()
        return {
            "items": [dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def list_assigned_codes_for_export(self) -> list[dict[str, Any]]:
        with self.database.connection() as conn:
            rows = conn.execute(
                """
                SELECT pid, did, license, code, payload_json, assigned_mac, assigned_at, source_batch, created_at
                FROM auth_codes
                WHERE status = 'assigned'
                ORDER BY assigned_at DESC, id DESC
                """
            ).fetchall()
        return [self._decode_row(row) for row in rows]

    @staticmethod
    def _collect_duplicate_pid_dids(rows: list[dict[str, str]]) -> set[str]:
        seen: set[tuple[str, str]] = set()
        duplicates: set[str] = set()
        for row in rows:
            pid = row.get("pid", "").strip()
            did = row.get("did", "").strip()
            if not pid or not did:
                continue
            key = (pid, did)
            if key in seen:
                duplicates.add(AuthCodeRepository._format_pid_did(pid, did))
            seen.add(key)
        return duplicates

    @staticmethod
    def find_existing_pid_dids(conn, pid_dids: list[tuple[str, str]]) -> set[str]:
        normalized = sorted(
            {
                (pid.strip(), did.strip())
                for pid, did in pid_dids
                if pid.strip() and did.strip()
            }
        )
        if not normalized:
            return set()
        where_sql = " OR ".join("(pid = ? AND did = ?)" for _ in normalized)
        params = [value for pair in normalized for value in pair]
        rows = conn.execute(
            f"SELECT pid, did FROM auth_codes WHERE {where_sql}",
            params,
        ).fetchall()
        return {
            AuthCodeRepository._format_pid_did(row["pid"], row["did"])
            for row in rows
        }

    @staticmethod
    def _format_pid_did(pid: str, did: str) -> str:
        return f"{pid} / {did}"

    @staticmethod
    def _build_log_filters(action: str) -> tuple[str, list[Any]]:
        params: list[Any] = []
        if action in {"assigned", "reused", "exhausted"}:
            params.append(action)
            return "WHERE action = ?", params
        return "", params

    @staticmethod
    def _decode_row(row) -> dict[str, Any]:
        item = dict(row)
        payload = json.loads(item.get("payload_json") or "{}")
        item["payload"] = payload
        item["payload_preview"] = json.dumps(payload, ensure_ascii=False, indent=2)
        item["display_code"] = item.get("did") or item.get("code")
        return item

    @staticmethod
    def _decode_log_row(row) -> dict[str, Any]:
        item = dict(row)
        payload_json = item.get("payload_json")
        payload = json.loads(payload_json) if payload_json else None
        item["payload"] = payload
        item["payload_preview"] = (
            json.dumps(payload, ensure_ascii=False, indent=2) if payload is not None else ""
        )
        return item
