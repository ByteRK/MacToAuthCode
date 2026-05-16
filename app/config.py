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
    data_dir = Path(os.getenv("AUTH_PLATFORM_DATA_DIR", base_dir / "data"))

    return Settings(
        app_name=os.getenv("AUTH_PLATFORM_NAME", "授权码分发平台"),
        host=os.getenv("AUTH_PLATFORM_HOST", "0.0.0.0"),
        port=int(os.getenv("AUTH_PLATFORM_PORT", "8080")),
        admin_username=os.getenv("AUTH_PLATFORM_ADMIN_USER", "admin"),
        admin_password=os.getenv("AUTH_PLATFORM_ADMIN_PASSWORD", "ChangeMe123!"),
        secret_key=os.getenv("AUTH_PLATFORM_SECRET_KEY", secrets.token_hex(16)),
        data_dir=data_dir,
    )
