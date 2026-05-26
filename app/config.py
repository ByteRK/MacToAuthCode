import json
import os
import secrets
import sys
from dataclasses import dataclass, field
from pathlib import Path


def runtime_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def _as_bool(value: object, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_string_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value).split(",") if item.strip()]


@dataclass(slots=True)
class Settings:
    app_name: str
    host: str
    port: int
    admin_username: str
    admin_password: str
    secret_key: str
    data_dir: Path
    dns_enabled: bool = False
    dns_host: str = "0.0.0.0"
    dns_port: int = 53
    dns_target_ip: str = ""
    dns_upstream_host: str = "223.5.5.5"
    dns_upstream_port: int = 53
    dns_override_domains: tuple[str, ...] = field(default_factory=tuple)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "auth_codes.db"

    @property
    def export_dir(self) -> Path:
        return self.data_dir / "exports"

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.export_dir.mkdir(parents=True, exist_ok=True)


def load_settings() -> Settings:
    base_dir = runtime_base_dir()
    config_path = Path(os.getenv("AUTH_PLATFORM_CONFIG_FILE", base_dir / "config.json"))
    file_config: dict[str, object] = {}
    if config_path.exists():
        file_config = json.loads(config_path.read_text(encoding="utf-8"))
    dns_config = file_config.get("dns_server", {})
    if not isinstance(dns_config, dict):
        dns_config = {}

    return Settings(
        app_name=str(
            os.getenv(
                "AUTH_PLATFORM_NAME",
                file_config.get("app_name", "授权码分发平台"),
            )
        ),
        host=str(
            os.getenv(
                "AUTH_PLATFORM_HOST",
                file_config.get("host", "0.0.0.0"),
            )
        ),
        port=int(
            os.getenv(
                "AUTH_PLATFORM_PORT",
                str(file_config.get("port", "8080")),
            )
        ),
        admin_username=str(
            os.getenv(
                "AUTH_PLATFORM_ADMIN_USER",
                file_config.get("admin_username", "admin"),
            )
        ),
        admin_password=str(
            os.getenv(
                "AUTH_PLATFORM_ADMIN_PASSWORD",
                file_config.get("admin_password", "ChangeMe123!"),
            )
        ),
        secret_key=str(
            os.getenv(
                "AUTH_PLATFORM_SECRET_KEY",
                file_config.get("secret_key", secrets.token_hex(16)),
            )
        ),
        data_dir=Path(
            os.getenv(
                "AUTH_PLATFORM_DATA_DIR",
                str(file_config.get("data_dir", base_dir / "data")),
            )
        ),
        dns_enabled=_as_bool(
            os.getenv(
                "AUTH_PLATFORM_DNS_ENABLED",
                dns_config.get("enabled", False),
            )
        ),
        dns_host=str(
            os.getenv(
                "AUTH_PLATFORM_DNS_HOST",
                dns_config.get("host", "0.0.0.0"),
            )
        ),
        dns_port=int(
            os.getenv(
                "AUTH_PLATFORM_DNS_PORT",
                str(dns_config.get("port", "53")),
            )
        ),
        dns_target_ip=str(
            os.getenv(
                "AUTH_PLATFORM_DNS_TARGET_IP",
                dns_config.get("target_ip", ""),
            )
        ),
        dns_upstream_host=str(
            os.getenv(
                "AUTH_PLATFORM_DNS_UPSTREAM_HOST",
                dns_config.get("upstream_host", "223.5.5.5"),
            )
        ),
        dns_upstream_port=int(
            os.getenv(
                "AUTH_PLATFORM_DNS_UPSTREAM_PORT",
                str(dns_config.get("upstream_port", "53")),
            )
        ),
        dns_override_domains=tuple(
            _as_string_list(
                os.getenv(
                    "AUTH_PLATFORM_DNS_OVERRIDE_DOMAINS",
                    dns_config.get("override_domains", []),
                )
            )
        ),
    )
