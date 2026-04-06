from __future__ import annotations

from pathlib import Path


class EnginePaths:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.sessions_dir = data_dir / "sessions"
        self.secret_file = data_dir / "installation.secret"

    def ensure(self) -> None:
        self.sessions_dir.mkdir(parents=True, exist_ok=True)

    def session_path(self, session_id: str) -> Path:
        return self.sessions_dir / f"{session_id}.bin"
