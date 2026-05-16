from collections.abc import Iterable
from typing import Any

from app.database import Database


class AuthCodeRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def find_assigned_by_mac(self, conn, pid: str, mac: str) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT pid, code, assigned_mac, assigned_at, source_batch
            FROM auth_codes
            WHERE pid = ? AND assigned_mac = ?
            LIMIT 1
            """,
            (pid, mac),
        ).fetchone()
        return dict(row) if row else None

    def claim_next_available_code(self, conn, pid: str, mac: str) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT id, pid, code, source_batch
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
            SELECT pid, code, assigned_mac, assigned_at, source_batch
            FROM auth_codes
            WHERE id = ?
            """,
            (row["id"],),
        ).fetchone()
        return dict(assigned) if assigned else None

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
    ) -> None:
        conn.execute(
            """
            INSERT INTO distribution_logs (pid, mac, code, action, message, client_ip)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (pid, mac, code, action, message, client_ip),
        )

    def bulk_insert_codes(self, rows: Iterable[dict[str, str]]) -> dict[str, int]:
        inserted = 0
        skipped = 0
        with self.database.connection() as conn:
            for row in rows:
                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO auth_codes (pid, code, source_batch)
                    VALUES (?, ?, ?)
                    """,
                    (row["pid"], row["code"], row.get("source_batch")),
                )
                if cursor.rowcount == 1:
                    inserted += 1
                else:
                    skipped += 1
        return {"inserted": inserted, "skipped": skipped}

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

    def fetch_recent_logs(self, limit: int = 20) -> list[dict[str, Any]]:
        with self.database.connection() as conn:
            rows = conn.execute(
                """
                SELECT pid, mac, code, action, message, client_ip, created_at
                FROM distribution_logs
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

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
                  AND (pid LIKE ? OR assigned_mac LIKE ? OR code LIKE ?)
                """,
                (keyword, keyword, keyword),
            ).fetchone()[0]
            rows = conn.execute(
                """
                SELECT pid, code, assigned_mac, assigned_at, source_batch
                FROM auth_codes
                WHERE status = 'assigned'
                  AND (pid LIKE ? OR assigned_mac LIKE ? OR code LIKE ?)
                ORDER BY assigned_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (keyword, keyword, keyword, page_size, offset),
            ).fetchall()
        return {
            "items": [dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def list_codes(
        self,
        *,
        status: str = "all",
        search: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        clauses = []
        params: list[Any] = []
        if status in {"available", "assigned"}:
            clauses.append("status = ?")
            params.append(status)
        if search:
            clauses.append(
                "(pid LIKE ? OR code LIKE ? OR COALESCE(assigned_mac, '') LIKE ?)"
            )
            keyword = f"%{search.strip()}%"
            params.extend([keyword, keyword, keyword])

        where_sql = " AND ".join(clauses) if clauses else "1=1"
        offset = (page - 1) * page_size
        with self.database.connection() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM auth_codes WHERE {where_sql}",
                params,
            ).fetchone()[0]
            rows = conn.execute(
                f"""
                SELECT pid, code, source_batch, status, assigned_mac, assigned_at, created_at
                FROM auth_codes
                WHERE {where_sql}
                ORDER BY id DESC
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
                SELECT pid, code, assigned_mac, assigned_at, source_batch, created_at
                FROM auth_codes
                WHERE status = 'assigned'
                ORDER BY assigned_at DESC, id DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]
