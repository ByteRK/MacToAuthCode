import re
from typing import Any

from app.repositories.auth_code_repository import AuthCodeRepository


MAC_PATTERN = re.compile(r"^[0-9A-F]{2}([-:]?[0-9A-F]{2}){5}$")


class AuthCodeService:
    def __init__(self, repository: AuthCodeRepository) -> None:
        self.repository = repository

    def distribute_code(
        self,
        mac: str,
        pid: str,
        client_ip: str | None,
    ) -> tuple[dict[str, Any], int]:
        normalized_mac = self.normalize_mac(mac)
        normalized_pid = self.normalize_pid(pid)

        with self.repository.database.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")

            existing = self.repository.find_assigned_by_mac(conn, normalized_pid, normalized_mac)
            if existing:
                self.repository.log_distribution(
                    conn,
                    pid=normalized_pid,
                    mac=normalized_mac,
                    action="reused",
                    message="设备重复请求，返回已分配授权码",
                    client_ip=client_ip,
                    code=existing["code"],
                )
                return {
                    "success": True,
                    "message": "授权码已存在，返回原结果",
                    "data": {
                        "pid": normalized_pid,
                        "mac": normalized_mac,
                        "auth_code": existing["code"],
                        "assigned_at": existing["assigned_at"],
                        "source_batch": existing["source_batch"],
                        "mode": "reused",
                    },
                }, 200

            assigned = self.repository.claim_next_available_code(
                conn,
                normalized_pid,
                normalized_mac,
            )
            if assigned is None:
                self.repository.log_distribution(
                    conn,
                    pid=normalized_pid,
                    mac=normalized_mac,
                    action="exhausted",
                    message="授权码库存不足",
                    client_ip=client_ip,
                )
                return {
                    "success": False,
                    "message": "当前没有可分配的授权码",
                    "data": {"pid": normalized_pid, "mac": normalized_mac},
                }, 409

            self.repository.log_distribution(
                conn,
                pid=normalized_pid,
                mac=normalized_mac,
                action="assigned",
                message="授权码分配成功",
                client_ip=client_ip,
                code=assigned["code"],
            )
            return {
                "success": True,
                "message": "授权码分配成功",
                "data": {
                    "pid": normalized_pid,
                    "mac": normalized_mac,
                    "auth_code": assigned["code"],
                    "assigned_at": assigned["assigned_at"],
                    "source_batch": assigned["source_batch"],
                    "mode": "assigned",
                },
            }, 200

    @staticmethod
    def normalize_mac(mac: str) -> str:
        compact = mac.strip().upper().replace("-", "").replace(":", "")
        if len(compact) != 12:
            raise ValueError("MAC 地址格式不正确")
        normalized = ":".join(compact[index : index + 2] for index in range(0, 12, 2))
        if not MAC_PATTERN.fullmatch(normalized):
            raise ValueError("MAC 地址格式不正确")
        return normalized

    @staticmethod
    def normalize_pid(pid: str) -> str:
        normalized = pid.strip()
        if not normalized:
            raise ValueError("PID 不能为空")
        if len(normalized) > 100:
            raise ValueError("PID 长度不能超过 100")
        return normalized
