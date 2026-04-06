from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from time import time

if os.name == "nt":  # pragma: no cover - Windows fallback
    import msvcrt
else:  # pragma: no cover - exercised on Linux/macOS
    import fcntl


class EngineProcessLockError(RuntimeError):
    """Raised when another local-engine instance already owns the data dir."""


@dataclass(slots=True)
class EngineProcessLock:
    lock_path: Path
    handle: int

    @classmethod
    def acquire(cls, data_dir: Path) -> EngineProcessLock:
        data_dir = data_dir.resolve()
        data_dir.mkdir(parents=True, exist_ok=True)
        lock_path = data_dir / ".engine.lock"
        handle = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)

        try:
            if os.name == "nt":  # pragma: no cover - Windows fallback
                msvcrt.locking(handle, msvcrt.LK_NBLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            os.close(handle)
            raise EngineProcessLockError(
                f"The local engine data dir is already locked by another process: {lock_path}"
            ) from exc

        payload = f"{os.getpid()}\n{int(time())}\n".encode()
        os.ftruncate(handle, 0)
        os.write(handle, payload)
        os.fsync(handle)
        return cls(lock_path=lock_path, handle=handle)

    def release(self) -> None:
        if self.handle < 0:
            return
        try:
            if os.name == "nt":  # pragma: no cover - Windows fallback
                os.lseek(self.handle, 0, os.SEEK_SET)
                msvcrt.locking(self.handle, msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(self.handle, fcntl.LOCK_UN)
        finally:
            os.close(self.handle)
            self.handle = -1
