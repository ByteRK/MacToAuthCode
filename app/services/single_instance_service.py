import json
import os
import socket
import sys
from pathlib import Path
from typing import TextIO

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows only
    fcntl = None

try:
    import msvcrt
except ImportError:  # pragma: no cover - POSIX only
    msvcrt = None


class SingleInstanceError(RuntimeError):
    """Raised when another instance is already holding the same app lock."""


class PortUnavailableError(RuntimeError):
    """Raised when the configured listening port is already occupied."""


class SingleInstanceService:
    def __init__(self, lock_path: Path) -> None:
        self.lock_path = lock_path
        self._handle: TextIO | None = None

    def acquire(self) -> None:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.lock_path.open("a+", encoding="utf-8")
        try:
            self._lock_handle(handle)
            handle.seek(0)
            handle.truncate()
            json.dump({"pid": os.getpid()}, handle, ensure_ascii=False)
            handle.flush()
            self._handle = handle
        except Exception:
            handle.close()
            raise

    def release(self) -> None:
        if self._handle is None:
            return
        try:
            self._unlock_handle(self._handle)
        finally:
            self._handle.close()
            self._handle = None

    def __enter__(self) -> "SingleInstanceService":
        self.acquire()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.release()

    @staticmethod
    def build_lock_path(base_dir: Path, port: int) -> Path:
        return base_dir / f"instance-{port}.lock"

    @staticmethod
    def build_runtime_lock_path(app_name: str, port: int) -> Path:
        return SingleInstanceService.runtime_lock_dir(app_name) / f"instance-{port}.lock"

    @staticmethod
    def runtime_lock_dir(app_name: str) -> Path:
        safe_name = "".join(
            char if char.isalnum() or char in {"-", "_"} else "_"
            for char in app_name.strip()
        ).strip("_") or "auth_code_platform"

        if os.name == "nt":
            base_dir = Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        elif sys.platform == "darwin":
            base_dir = Path.home() / "Library" / "Application Support"
        else:
            base_dir = Path(
                os.getenv("XDG_STATE_HOME", Path.home() / ".local" / "state")
            )
        return base_dir / safe_name / "locks"

    @staticmethod
    def ensure_port_available(host: str, port: int) -> None:
        address = host or "0.0.0.0"
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((address, port))
            except OSError as exc:
                raise PortUnavailableError(
                    f"port {port} is already in use on host {address}"
                ) from exc

    @staticmethod
    def _lock_handle(handle: TextIO) -> None:
        if msvcrt is not None:
            handle.seek(0)
            handle.write(" ")
            handle.flush()
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:  # pragma: no cover - platform dependent
                raise SingleInstanceError("another instance is already running") from exc
            return

        if fcntl is not None:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:  # pragma: no cover - platform dependent
                raise SingleInstanceError("another instance is already running") from exc
            return

        raise RuntimeError("current platform does not support file locking")

    @staticmethod
    def _unlock_handle(handle: TextIO) -> None:
        if msvcrt is not None:
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                return
            return

        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
