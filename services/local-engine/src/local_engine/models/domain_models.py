from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from local_engine.models.enums import EntityType


def utc_now() -> datetime:
    return datetime.now(UTC)


def make_lookup_key(entity_type: EntityType, canonical_text: str) -> str:
    return f"{entity_type.value}:{canonical_text}"


@dataclass(slots=True)
class RawFinding:
    entity_type: EntityType
    detector: str
    original_text: str
    canonical_text: str
    start: int
    end: int
    confidence: float
    rationale: str | None = None
    id: str = field(default_factory=lambda: str(uuid4()))

    @property
    def review_recommended(self) -> bool:
        explicit_safe_detectors = {
            "regex:username-handle",
            "regex:labeled-person",
            "ml:username-labeled",
            "ml:person-intro",
            "ml:person-salutation",
        }
        return (
            self.detector.startswith("dictionary")
            or self.entity_type is EntityType.CUSTOM
            or (
                self.entity_type in {EntityType.PERSON, EntityType.USERNAME}
                and (
                    self.detector not in explicit_safe_detectors
                    or self.confidence < 0.72
                )
            )
            or (self.entity_type is EntityType.HOSTNAME and self.confidence < 0.8)
            or self.confidence < 0.55
        )


@dataclass(slots=True)
class PlannedReplacement:
    finding_id: str
    entity_type: EntityType
    start: int
    end: int
    original_text: str
    placeholder: str
    confidence: float
    applied: bool = True


@dataclass(slots=True)
class SessionRecord:
    session_id: str
    conversation_id: str
    mapping: dict[str, str] = field(default_factory=dict)
    reverse_lookup: dict[str, str] = field(default_factory=dict)
    counters: dict[str, int] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)
    expires_at: datetime = field(default_factory=lambda: utc_now() + timedelta(minutes=45))
    replacement_count: int = 0
    low_confidence_count: int = 0
    review_pending: bool = False

    @classmethod
    def new(
        cls,
        conversation_id: str,
        ttl_minutes: int,
        session_id: str | None = None,
    ) -> SessionRecord:
        now = utc_now()
        return cls(
            session_id=session_id or str(uuid4()),
            conversation_id=conversation_id,
            created_at=now,
            updated_at=now,
            expires_at=now + timedelta(minutes=ttl_minutes),
        )

    @property
    def mapping_count(self) -> int:
        return len(self.mapping)

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= utc_now()

    def touch(self, ttl_minutes: int) -> None:
        self.updated_at = utc_now()
        self.expires_at = self.updated_at + timedelta(minutes=ttl_minutes)

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "conversation_id": self.conversation_id,
            "mapping": self.mapping,
            "reverse_lookup": self.reverse_lookup,
            "counters": self.counters,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "replacement_count": self.replacement_count,
            "low_confidence_count": self.low_confidence_count,
            "review_pending": self.review_pending,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> SessionRecord:
        return cls(
            session_id=str(payload["session_id"]),
            conversation_id=str(payload["conversation_id"]),
            mapping={
                str(key): str(value) for key, value in dict(payload.get("mapping", {})).items()
            },
            reverse_lookup={
                str(key): str(value)
                for key, value in dict(payload.get("reverse_lookup", {})).items()
            },
            counters={
                str(key): int(value) for key, value in dict(payload.get("counters", {})).items()
            },
            created_at=datetime.fromisoformat(str(payload["created_at"])),
            updated_at=datetime.fromisoformat(str(payload["updated_at"])),
            expires_at=datetime.fromisoformat(str(payload["expires_at"])),
            replacement_count=int(payload.get("replacement_count", 0)),
            low_confidence_count=int(payload.get("low_confidence_count", 0)),
            review_pending=bool(payload.get("review_pending", False)),
        )
