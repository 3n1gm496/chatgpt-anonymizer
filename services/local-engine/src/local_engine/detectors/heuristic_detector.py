"""
Contextual heuristic detector.

These rules use labeled-context regular expressions to identify entity types
that are ambiguous without surrounding context — person names after honorifics,
usernames after an explicit label, custom identifiers after a key–value marker.

This is NOT machine learning. There is no model, no embedding, no statistical
inference. The class is named ContextualHeuristicDetector, and individual rule
names carry the "heuristic:" prefix, to be precise about the detection mechanism.

A future local-NER or local-ML detector should be implemented as a separate
class with a distinct prefix ("ner:" or "ml:") and should load actual model
weights at initialisation time.
"""
from __future__ import annotations

import re

from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType
from local_engine.utils.text_normalization import canonicalize_value

_PERSON_NAME = r"[A-Z][A-Za-zÀ-ÖØ-öø-ÿ']+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ']+){1,2}"


class ContextualHeuristicDetector:
    """
    Rule-based contextual heuristics for entity types that require label context.

    Each rule is a (entity_type, rule_name, confidence, rationale, pattern) tuple.
    Rules fire only when the surrounding text contains an explicit semantic label
    (e.g. "Username:", "Mi chiamo", "Dr.") that strongly disambiguates the
    candidate value.
    """

    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.name = "heuristic:contextual"
        self._rules: tuple[tuple[EntityType, str, float, str, re.Pattern[str]], ...] = (
            (
                EntityType.USERNAME,
                "heuristic:username-labeled",
                0.8,
                "Contextual heuristic: explicit username/account label followed by value.",
                re.compile(
                    r"\b(?:username|user|utente|login|account|profilo|handle)\s*[:=-]\s*"
                    r"([a-z0-9][a-z0-9._-]{2,31})\b",
                    re.IGNORECASE,
                ),
            ),
            (
                EntityType.PERSON,
                "heuristic:person-intro",
                0.72,
                "Contextual heuristic: self-identification or contact-name phrase.",
                re.compile(
                    rf"\b(?:mi chiamo|sono|referente|contatto|cliente|paziente"
                    rf"|nome(?:\s+completo)?)\s*[:=-]?\s+({_PERSON_NAME})\b",
                    re.IGNORECASE,
                ),
            ),
            (
                EntityType.PERSON,
                "heuristic:person-salutation",
                0.74,
                "Contextual heuristic: honorific followed by a likely full name.",
                re.compile(
                    rf"\b(?:sig\.?|sig\.ra|mr\.?|mrs\.?|ms\.?|dr\.?|dott\.?|dottoressa|avv\.?|ing\.?)"
                    rf"\s+({_PERSON_NAME})\b",
                    re.IGNORECASE,
                ),
            ),
            (
                EntityType.CUSTOM,
                "heuristic:custom-labeled-id",
                0.61,
                "Contextual heuristic: labeled internal/customer identifier.",
                re.compile(
                    r"\b(?:cliente|client|customer|account|practice|matricola|employee|dipendente)"
                    r"\s*(?:id|code|codice|number|numero)?\s*[:#=-]\s*([A-Z0-9][A-Z0-9._-]{5,})\b",
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
