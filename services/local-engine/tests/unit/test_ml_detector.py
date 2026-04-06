from local_engine.detectors.ml_detector import OptionalMlDetector
from local_engine.models.enums import EntityType


def test_optional_ml_detector_finds_labeled_username_when_enabled():
    detector = OptionalMlDetector(enabled=True)

    hits = detector.detect("Username: mario.rossi")

    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.USERNAME
    assert hits[0].original_text == "mario.rossi"


def test_optional_ml_detector_finds_intro_person_name_when_enabled():
    detector = OptionalMlDetector(enabled=True)

    hits = detector.detect("Mi chiamo Mario Rossi e ti scrivo per un caso urgente.")

    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.PERSON
    assert hits[0].original_text == "Mario Rossi"


def test_optional_ml_detector_finds_labeled_custom_identifier_when_enabled():
    detector = OptionalMlDetector(enabled=True)

    hits = detector.detect("Cliente ID: ABC12345 da controllare")

    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.CUSTOM
    assert hits[0].original_text == "ABC12345"


def test_optional_ml_detector_returns_nothing_when_disabled():
    detector = OptionalMlDetector(enabled=False)

    assert detector.detect("Username: mario.rossi") == []
