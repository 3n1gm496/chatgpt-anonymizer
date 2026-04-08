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
    """
    Produce a canonical form of ``value`` for the given entity type.

    Canonical values are used as de-duplication keys within a session so that
    the same logical entity (e.g. an email address written in different cases)
    always maps to the same placeholder.
    """
    if entity_type in {EntityType.EMAIL, EntityType.HOSTNAME, EntityType.URL, EntityType.USERNAME}:
        return value.lower()
    if entity_type == EntityType.PHONE:
        return _PHONE_DIGITS_RE.sub("", value)
    if entity_type == EntityType.IBAN:
        # Normalise spaces and force uppercase for consistent key
        return value.replace(" ", "").upper()
    if entity_type == EntityType.PAYMENT_CARD:
        # Strip formatting separators; the caller should pass digits-only
        return _PHONE_DIGITS_RE.sub("", value)
    if entity_type == EntityType.SECRET:
        # Secrets are case-sensitive; no normalisation
        return value
    return value
