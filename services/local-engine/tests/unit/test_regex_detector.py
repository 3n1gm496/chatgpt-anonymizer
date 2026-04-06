from local_engine.detectors.regex_detector import build_default_regex_detectors


def _detector(name: str):
    return next(detector for detector in build_default_regex_detectors() if detector.name == name)


def test_email_and_ipv4_detection():
    text = "Email user@example.com connected to 203.0.113.15 and ignored 127.0.0.1"

    email_hits = _detector("regex:email").detect(text)
    ipv4_hits = _detector("regex:ipv4").detect(text)

    assert [hit.original_text for hit in email_hits] == ["user@example.com"]
    assert [hit.original_text for hit in ipv4_hits] == ["203.0.113.15"]


def test_valid_codice_fiscale_is_detected():
    text = "Codice fiscale RSSMRA85T10A562S da trattare"

    hits = _detector("regex:codice-fiscale").detect(text)

    assert len(hits) == 1
    assert hits[0].original_text == "RSSMRA85T10A562S"


def test_phone_detector_ignores_plain_numeric_ticket_ids():
    text = "Ticket 1234567891 aperto da verificare"

    hits = _detector("regex:phone").detect(text)

    assert hits == []


def test_phone_detector_accepts_plain_digits_with_phone_context():
    text = "Telefono 3475550101 da richiamare oggi"

    hits = _detector("regex:phone").detect(text)

    assert len(hits) == 1
    assert hits[0].original_text == "3475550101"


def test_phone_detector_ignores_semantic_versions():
    text = "Versione 1.2.3.4567 distribuita ieri"

    hits = _detector("regex:phone").detect(text)

    assert hits == []


def test_username_handle_detector_captures_explicit_mentions():
    text = "Scrivi a @mario.rossi per favore"

    hits = _detector("regex:username-handle").detect(text)

    assert len(hits) == 1
    assert hits[0].original_text == "@mario.rossi"


def test_labeled_person_detector_captures_only_the_name_value():
    text = "Nome: Mario Rossi"

    hits = _detector("regex:labeled-person").detect(text)

    assert len(hits) == 1
    assert hits[0].original_text == "Mario Rossi"
