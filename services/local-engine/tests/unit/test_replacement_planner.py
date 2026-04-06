from local_engine.detectors.regex_detector import build_default_regex_detectors
from local_engine.models.domain_models import SessionRecord
from local_engine.pseudonymizer.engine import PseudonymizerEngine
from local_engine.pseudonymizer.replacement_planner import (
    apply_replacements,
    build_replacement_plan,
)


def test_replacement_plan_reuses_placeholder_for_same_value():
    text = "Email user@example.com copied again user@example.com"
    session = SessionRecord.new(conversation_id="tab:1:chat:new", ttl_minutes=45)
    engine = PseudonymizerEngine()
    detector = next(
        detector for detector in build_default_regex_detectors() if detector.name == "regex:email"
    )
    findings = detector.detect(text)

    replacements = build_replacement_plan(findings, session, engine)
    sanitized = apply_replacements(text, replacements)

    assert replacements[0].placeholder == replacements[1].placeholder
    assert sanitized.count("[EMAIL_001]") == 2


def test_replacement_plan_respects_exclusions():
    text = "Email user@example.com"
    session = SessionRecord.new(conversation_id="tab:1:chat:new", ttl_minutes=45)
    engine = PseudonymizerEngine()
    detector = next(
        detector for detector in build_default_regex_detectors() if detector.name == "regex:email"
    )
    finding = detector.detect(text)[0]

    replacements = build_replacement_plan([finding], session, engine, exclusions={finding.id})
    sanitized = apply_replacements(text, replacements)

    assert replacements[0].applied is False
    assert sanitized == text
