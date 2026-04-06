from __future__ import annotations

import re

from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType
from local_engine.utils.text_normalization import canonicalize_value

_PERSON_NAME = r"[A-Z][A-Za-zÀ-ÖØ-öø-ÿ']+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ']+){1,2}"


class OptionalMlDetector:
    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.name = "ml:local-heuristic"
        self._rules: tuple[tuple[EntityType, str, float, str, re.Pattern[str]], ...] = (
            (
                EntityType.USERNAME,
                "ml:username-labeled",
                0.8,
                "Local heuristic matched an explicit username/account label.",
                re.compile(
                    r"\b(?:username|user|utente|login|account|profilo|handle)\s*[:=-]\s*([a-z0-9][a-z0-9._-]{2,31})\b",
                    re.IGNORECASE,
                ),
            ),
            (
                EntityType.PERSON,
                "ml:person-intro",
                0.72,
                "Local heuristic matched a self-identification or contact-name phrase.",
                re.compile(
                    rf"\b(?:mi chiamo|sono|referente|contatto|cliente|paziente"
                    rf"|nome(?:\s+completo)?)\s*[:=-]?\s+({_PERSON_NAME})\b",
                    re.IGNORECASE,
                ),
            ),
            (
                EntityType.PERSON,
                "ml:person-salutation",
                0.74,
                "Local heuristic matched an honorific followed by a likely full name.",
                re.compile(
                    rf"\b(?:sig\.?|sig\.ra|mr\.?|mrs\.?|ms\.?|dr\.?|dott\.?|dottoressa|avv\.?|ing\.?)\s+({_PERSON_NAME})\b",
                    re.IGNORECASE,
                ),
            ),
            (
                EntityType.CUSTOM,
                "ml:custom-labeled-id",
                0.61,
                "Local heuristic matched a labeled internal/customer identifier.",
                re.compile(
                    r"\b(?:cliente|client|customer|account|practice|matricola|employee|dipendente)\s*(?:id|code|codice|number|numero)?\s*[:#=-]\s*([A-Z0-9][A-Z0-9._-]{5,})\b",
                    re.IGNORECASE,
                ),
            ),
        )

    def detect(self, text: str) -> list[RawFinding]:
        if not self.enabled:
            return []

        findings: list[RawFinding] = []
        for entity_type, detector_name, confidence, rationale, pattern in self._rules:
            for match in pattern.finditer(text):
                original = match.group(1).strip()
                if len(original) < 3:
                    continue
                findings.append(
                    RawFinding(
                        entity_type=entity_type,
                        detector=detector_name,
                        original_text=original,
                        canonical_text=canonicalize_value(entity_type, original),
                        start=match.start(1),
                        end=match.end(1),
                        confidence=confidence,
                        rationale=rationale,
                    )
                )
        return findings
