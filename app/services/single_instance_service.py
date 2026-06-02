import json
import os
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
