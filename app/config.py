import json
import os
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path


def runtime_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


@dataclass(slots=True)
class Settings:
    app_name: str
    host: str
    port: int
    admin_username: str
    admin_password: str
    secret_key: str
    data_dir: Path

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
    file_config: dict[str, str | int] = {}
    if config_path.exists():
        file_config = json.loads(config_path.read_text(encoding="utf-8"))

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
    )
