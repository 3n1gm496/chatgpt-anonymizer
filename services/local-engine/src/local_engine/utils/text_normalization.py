from __future__ import annotations

import hashlib
import re

from local_engine.models.enums import EntityType

_WHITESPACE_RE = re.compile(r"\s+")
_PHONE_DIGITS_RE = re.compile(r"\D+")


def normalize_input_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def normalize_for_fingerprint(text: str) -> str:
    normalized = normalize_input_text(text).strip()
    return _WHITESPACE_RE.sub(" ", normalized)


def stable_fingerprint(text: str) -> str:
    normalized = normalize_for_fingerprint(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def canonicalize_value(entity_type: EntityType, value: str) -> str:
    if entity_type in {EntityType.EMAIL, EntityType.HOSTNAME, EntityType.URL, EntityType.USERNAME}:
        return value.lower()
    if entity_type == EntityType.PHONE:
        return _PHONE_DIGITS_RE.sub("", value)
    return value
