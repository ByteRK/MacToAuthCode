import json
from typing import Any

from app.config import Settings
from app.database import Database
from app.services.request_access_policy_service import RequestAccessPolicyService


class ConfigurationService:
    REQUEST_IP_WHITELIST_KEY = "request_ip_whitelist"

    def __init__(
        self,
        database: Database,
        settings: Settings,
        request_access_policy_service: RequestAccessPolicyService,
    ) -> None:
        self.database = database
        self.settings = settings
        self.request_access_policy_service = request_access_policy_service
        self._bootstrap_request_ip_whitelist()

    def get_request_ip_whitelist_config(self) -> dict[str, Any]:
        config = self._get_setting(self.REQUEST_IP_WHITELIST_KEY)
        if config is None:
            config = self._build_default_request_ip_whitelist_config()
            self._save_setting(self.REQUEST_IP_WHITELIST_KEY, config)
        return self._normalize_request_ip_whitelist_config(config)

    def update_request_ip_whitelist_config(
        self,
        *,
        enabled: bool,
        allowed_ips: list[str],
    ) -> dict[str, Any]:
        normalized_allowed_ips = RequestAccessPolicyService.normalize_allowed_entries(allowed_ips)
        config = {
            "enabled": enabled,
            "allowed_ips": list(normalized_allowed_ips),
        }
        self._save_setting(self.REQUEST_IP_WHITELIST_KEY, config)
        self.request_access_policy_service.update_policy(
            enabled=enabled,
            allowed_entries=normalized_allowed_ips,
        )
        return config

    def _bootstrap_request_ip_whitelist(self) -> None:
        config = self._get_setting(self.REQUEST_IP_WHITELIST_KEY)
        if config is None:
            config = self._build_default_request_ip_whitelist_config()
            self._save_setting(self.REQUEST_IP_WHITELIST_KEY, config)
        normalized = self._normalize_request_ip_whitelist_config(config)
        self.request_access_policy_service.update_policy(
            enabled=normalized["enabled"],
            allowed_entries=tuple(normalized["allowed_ips"]),
        )

    def _get_setting(self, key: str) -> dict[str, Any] | None:
        with self.database.connection() as conn:
            row = conn.execute(
                "SELECT value_json FROM app_settings WHERE key = ?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        value = json.loads(row["value_json"])
        if not isinstance(value, dict):
            raise ValueError(f"{key} 配置格式不正确")
        return value

    def _save_setting(self, key: str, value: dict[str, Any]) -> None:
        payload = json.dumps(value, ensure_ascii=False, sort_keys=True)
        with self.database.connection() as conn:
            conn.execute(
                """
                INSERT INTO app_settings (key, value_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, payload),
            )

    def _build_default_request_ip_whitelist_config(self) -> dict[str, Any]:
        return {
            "enabled": self.settings.request_ip_whitelist_enabled,
            "allowed_ips": list(self.settings.request_ip_whitelist),
        }

    @staticmethod
    def _normalize_request_ip_whitelist_config(config: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(config, dict):
            raise ValueError("白名单配置格式不正确")
        raw_allowed_ips = config.get("allowed_ips", [])
        if not isinstance(raw_allowed_ips, list):
            raise ValueError("白名单配置格式不正确")
        normalized_allowed_ips = RequestAccessPolicyService.normalize_allowed_entries(
            [str(item) for item in raw_allowed_ips]
        )
        return {
            "enabled": bool(config.get("enabled", False)),
            "allowed_ips": list(normalized_allowed_ips),
        }
