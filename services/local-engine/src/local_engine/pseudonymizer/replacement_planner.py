from __future__ import annotations

from local_engine.models.domain_models import PlannedReplacement, RawFinding, SessionRecord
from local_engine.pseudonymizer.engine import PseudonymizerEngine


def build_replacement_plan(
    findings: list[RawFinding],
    session: SessionRecord,
    pseudonymizer: PseudonymizerEngine,
    exclusions: set[str] | None = None,
) -> list[PlannedReplacement]:
    exclusions = exclusions or set()
    replacements: list[PlannedReplacement] = []
    for finding in sorted(findings, key=lambda item: item.start):
        placeholder = pseudonymizer.get_or_create_placeholder(session, finding)
        replacements.append(
            PlannedReplacement(
                finding_id=finding.id,
                entity_type=finding.entity_type,
                start=finding.start,
                end=finding.end,
                original_text=finding.original_text,
                placeholder=placeholder,
                confidence=finding.confidence,
                applied=finding.id not in exclusions,
            )
        )
    return replacements


def apply_replacements(text: str, replacements: list[PlannedReplacement]) -> str:
    updated = text
    for replacement in sorted(replacements, key=lambda item: item.start, reverse=True):
        if not replacement.applied:
            continue
        updated = (
            updated[: replacement.start] + replacement.placeholder + updated[replacement.end :]
        )
    return updated


def revert_known_placeholders(
    text: str, mapping: dict[str, str]
) -> tuple[str, list[dict[str, str | int]]]:
    reverted = text
    matches: list[dict[str, str | int]] = []
    for placeholder in sorted(mapping.keys(), key=len, reverse=True):
        original = mapping[placeholder]
        count = reverted.count(placeholder)
        if count == 0:
            continue
        reverted = reverted.replace(placeholder, original)
        matches.append(
            {
                "placeholder": placeholder,
                "originalText": original,
                "count": count,
            }
        )
    return reverted, matches
