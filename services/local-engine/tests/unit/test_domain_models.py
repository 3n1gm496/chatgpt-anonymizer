from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType


def test_explicit_username_or_person_detectors_no_longer_force_manual_review():
    username = RawFinding(
        entity_type=EntityType.USERNAME,
        detector="regex:username-handle",
        original_text="@mario.rossi",
        canonical_text="@mario.rossi",
        start=0,
        end=12,
        confidence=0.78,
    )
    person = RawFinding(
        entity_type=EntityType.PERSON,
        detector="regex:labeled-person",
        original_text="Mario Rossi",
        canonical_text="Mario Rossi",
        start=0,
        end=11,
        confidence=0.74,
    )

    assert username.review_recommended is False
    assert person.review_recommended is False


def test_custom_and_dictionary_findings_still_request_review():
    custom = RawFinding(
        entity_type=EntityType.CUSTOM,
        detector="ml:custom-labeled-id",
        original_text="ABC12345",
        canonical_text="ABC12345",
        start=0,
        end=8,
        confidence=0.61,
    )
    dictionary = RawFinding(
        entity_type=EntityType.PERSON,
        detector="dictionary:custom",
        original_text="Mario Rossi",
        canonical_text="Mario Rossi",
        start=0,
        end=11,
        confidence=0.7,
    )

    assert custom.review_recommended is True
    assert dictionary.review_recommended is True
