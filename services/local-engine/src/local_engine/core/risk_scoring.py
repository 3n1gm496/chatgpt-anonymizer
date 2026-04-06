from __future__ import annotations

from collections import Counter

from local_engine.models.api_models import RiskSummaryModel
from local_engine.models.domain_models import PlannedReplacement, RawFinding
from local_engine.models.enums import RiskLevel


def build_risk_summary(
    findings: list[RawFinding],
    replacements: list[PlannedReplacement],
    review_threshold: float,
) -> RiskSummaryModel:
    entity_counts = Counter(finding.entity_type.value for finding in findings)
    low_confidence_count = sum(1 for finding in findings if finding.confidence < review_threshold)
    ambiguous_count = sum(1 for finding in findings if finding.review_recommended)
    replacement_count = sum(1 for replacement in replacements if replacement.applied)

    score = min(100.0, len(findings) * 12 + low_confidence_count * 18 + ambiguous_count * 10)
    if score >= 70:
        level = RiskLevel.HIGH.value
    elif score >= 35:
        level = RiskLevel.MEDIUM.value
    else:
        level = RiskLevel.LOW.value

    return RiskSummaryModel(
        score=score,
        level=level,
        findingsCount=len(findings),
        replacementCount=replacement_count,
        lowConfidenceCount=low_confidence_count,
        ambiguousCount=ambiguous_count,
        reviewRequired=False,
        entityCounts=dict(entity_counts),
    )
