from __future__ import annotations

from local_engine.core.policies import EngineSettings
from local_engine.detectors.dictionary_detector import DictionaryDetector
from local_engine.detectors.ml_detector import OptionalMlDetector
from local_engine.detectors.regex_detector import build_default_regex_detectors
from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType

_PRIORITY = {
    EntityType.EMAIL: 100,
    EntityType.URL: 95,
    EntityType.IPV4: 90,
    EntityType.CODICE_FISCALE: 88,
    EntityType.PARTITA_IVA: 87,
    EntityType.HOSTNAME: 75,
    EntityType.PHONE: 70,
    EntityType.USERNAME: 60,
    EntityType.PERSON: 50,
    EntityType.CUSTOM: 40,
}


def _priority_for(finding: RawFinding) -> int:
    return _PRIORITY.get(finding.entity_type, 10)


def resolve_overlaps(findings: list[RawFinding]) -> list[RawFinding]:
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


def build_detectors(settings: EngineSettings, enable_ml: bool = False) -> list[object]:
    detectors: list[object] = [
        *build_default_regex_detectors(),
        DictionaryDetector(settings.dictionary_terms),
    ]
    if settings.ml_enabled or enable_ml:
        detectors.append(OptionalMlDetector(enabled=True))
    return detectors


def detect_text(text: str, settings: EngineSettings, enable_ml: bool = False) -> list[RawFinding]:
    findings: list[RawFinding] = []
    for detector in build_detectors(settings, enable_ml=enable_ml):
        findings.extend(detector.detect(text))
    return resolve_overlaps(findings)


def registered_detector_names(settings: EngineSettings) -> list[str]:
    return [detector.name for detector in build_detectors(settings)]
