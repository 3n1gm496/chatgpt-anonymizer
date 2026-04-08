from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class EngineSettings:
    """
    Engine configuration.

    All fields are immutable after construction.  The engine binds exclusively
    to ``127.0.0.1``; this is enforced at construction time and cannot be
    overridden by environment variable to a different value.
    """

    host: str = "127.0.0.1"
    port: int = 8765
    data_dir: Path = Path("services/local-engine/.engine-state")
    session_ttl_minutes: int = 45
    review_threshold: float = 0.75
    # Renamed from ml_enabled: contextual heuristic rules (no ML involved)
    heuristics_enabled: bool = False
    max_text_chars: int = 50000
    log_level: str = "INFO"
    log_format: str = "json"
    dictionary_terms: dict[str, tuple[str, ...]] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> EngineSettings:
        host = os.getenv("LOCAL_ENGINE_HOST", "127.0.0.1")
        if host != "127.0.0.1":
            raise ValueError("LOCAL_ENGINE_HOST must remain 127.0.0.1 in this repository.")

        return cls(
            host=host,
            port=int(os.getenv("LOCAL_ENGINE_PORT", "8765")),
            data_dir=Path(
                os.getenv("LOCAL_ENGINE_DATA_DIR", "services/local-engine/.engine-state")
            ),
            session_ttl_minutes=int(os.getenv("LOCAL_ENGINE_SESSION_TTL_MINUTES", "45")),
            review_threshold=float(os.getenv("LOCAL_ENGINE_REVIEW_THRESHOLD", "0.75")),
            # Env var kept as LOCAL_ENGINE_ENABLE_HEURISTICS; legacy ML name also accepted
            heuristics_enabled=(
                os.getenv("LOCAL_ENGINE_ENABLE_HEURISTICS", "").lower() == "true"
                or os.getenv("LOCAL_ENGINE_ENABLE_ML", "").lower() == "true"
            ),
            max_text_chars=int(os.getenv("LOCAL_ENGINE_MAX_TEXT_CHARS", "50000")),
            log_level=os.getenv("LOCAL_ENGINE_LOG_LEVEL", "INFO").upper(),
            log_format=os.getenv("LOCAL_ENGINE_LOG_FORMAT", "json").lower(),
        )
