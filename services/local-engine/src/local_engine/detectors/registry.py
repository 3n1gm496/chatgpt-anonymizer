"""
Detector registry.

Builds the ordered list of detectors used by the pseudonymisation pipeline,
resolves overlapping findings by priority, and exposes the canonical detector
name list for the /health endpoint.

Detection is layered:
  1. Structural validators (email, IP, IBAN, payment card, CF, PIVA) — highest precision
  2. Secrets / credentials — high confidence, structural or vendor-prefixed
  3. Network patterns (URL, hostname) — high precision but can overlap with other types
  4. Phone numbers with context guard
  5. Contextual heuristics (labeled usernames, names via salutations/intros)
  6. Dictionary / custom terms — operator-supplied, lower confidence

There is currently no real ML/NER detector.  A future local-NER detector should
be added as a separate class and registered here with the "ner:" prefix.
"""
from __future__ import annotations

from local_engine.core.policies import EngineSettings
from local_engine.detectors.dictionary_detector import DictionaryDetector
from local_engine.detectors.financial_detector import IbanDetector, PaymentCardDetector
from local_engine.detectors.heuristic_detector import ContextualHeuristicDetector
from local_engine.detectors.regex_detector import build_default_regex_detectors
from local_engine.detectors.secrets_detector import SecretsDetector
from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType

# ---------------------------------------------------------------------------
# Priority table — higher wins when two findings overlap.
# Within the same priority, the longer match and higher confidence win.
# ---------------------------------------------------------------------------
_PRIORITY: dict[EntityType, int] = {
    EntityType.EMAIL: 100,
    EntityType.URL: 95,
    EntityType.IPV4: 90,
    EntityType.CODICE_FISCALE: 88,
    EntityType.PARTITA_IVA: 87,
    EntityType.IBAN: 86,
    EntityType.PAYMENT_CARD: 85,
    EntityType.SECRET: 84,
    EntityType.HOSTNAME: 75,
    EntityType.PHONE: 70,
    EntityType.USERNAME: 60,
    EntityType.PERSON: 50,
    EntityType.DATE_OF_BIRTH: 45,
    EntityType.ADDRESS: 43,
    EntityType.NATIONAL_ID: 42,
    EntityType.CUSTOM: 40,
}


def _priority_for(finding: RawFinding) -> int:
    return _PRIORITY.get(finding.entity_type, 10)


def resolve_overlaps(findings: list[RawFinding]) -> list[RawFinding]:
    """
    Remove overlapping findings, keeping the highest-priority match at each
    character span.  Tie-breaking order: priority > length > confidence.
    """
    ordered = sorted(
        findings,
        key=lambda item: (
            item.start,
            -_priority_for(item),
            -(item.end - item.start),
            -item.confidence,
        ),
    )
    resolved: list[RawFinding] = []
    for finding in ordered:
        if not resolved:
            resolved.append(finding)
            continue

        last = resolved[-1]
        overlaps = finding.start < last.end and finding.end > last.start
        if not overlaps:
            resolved.append(finding)
            continue

        last_key = (_priority_for(last), last.end - last.start, last.confidence)
        current_key = (_priority_for(finding), finding.end - finding.start, finding.confidence)
        if current_key > last_key:
            resolved[-1] = finding
    return resolved


def build_detectors(settings: EngineSettings, enable_heuristics: bool = False) -> list[object]:
    """
    Build the ordered detector list for a single sanitisation request.

    Parameters
    ----------
    settings:
        Engine configuration, including the custom dictionary and the
        heuristics-enabled flag.
    enable_heuristics:
        Whether to enable the contextual heuristic detector.  This is
        controlled per-request via the ``enableHeuristics`` field on
        ``SanitizeOptionsModel``.  When false the heuristic detector is
        instantiated with ``enabled=False`` and emits no findings.
    """
    detectors: list[object] = [
        *build_default_regex_detectors(),
        IbanDetector(),
        PaymentCardDetector(),
        SecretsDetector(),
        DictionaryDetector(settings.dictionary_terms),
    ]
    # Heuristic detector runs after structural detectors so that labeled names
    # adjacent to an already-detected email or CF are not double-counted.
    detectors.append(
        ContextualHeuristicDetector(enabled=bool(settings.heuristics_enabled or enable_heuristics))
    )
    return detectors


def detect_text(
    text: str,
    settings: EngineSettings,
    enable_heuristics: bool = False,
) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for detector in build_detectors(settings, enable_heuristics=enable_heuristics):
        findings.extend(detector.detect(text))
    return resolve_overlaps(findings)


def registered_detector_names(settings: EngineSettings) -> list[str]:
    return [detector.name for detector in build_detectors(settings)]
