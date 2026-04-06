from __future__ import annotations

import re

from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType
from local_engine.utils.text_normalization import canonicalize_value


class DictionaryDetector:
    def __init__(self, terms_by_entity: dict[str, tuple[str, ...]] | None = None):
        self.name = "dictionary:custom"
        self.terms_by_entity = terms_by_entity or {}

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        for entity_name, terms in self.terms_by_entity.items():
            if not terms:
                continue
            entity_type = EntityType(entity_name)
            for term in terms:
                pattern = re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)
                for match in pattern.finditer(text):
                    original = match.group(0)
                    findings.append(
                        RawFinding(
                            entity_type=entity_type,
                            detector=self.name,
                            original_text=original,
                            canonical_text=canonicalize_value(entity_type, original),
                            start=match.start(),
                            end=match.end(),
                            confidence=0.7,
                            rationale=(
                                "Dictionary terms are organization-specific and may "
                                "require confirmation."
                            ),
                        )
                    )
        return findings
