"""
Tests for IbanDetector and PaymentCardDetector.

Covers: MOD-97 validation, Luhn validation, false-positive rejection,
edge cases (spaces in IBAN, dash-separated cards, known BINs).
"""
from local_engine.detectors.financial_detector import IbanDetector, PaymentCardDetector
from local_engine.models.enums import EntityType

# ---------------------------------------------------------------------------
# IBAN
# ---------------------------------------------------------------------------

def test_iban_detector_accepts_valid_german_iban():
    detector = IbanDetector()
    hits = detector.detect("Accredita su DE89370400440532013000 entro venerdì.")
    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.IBAN
    assert hits[0].original_text == "DE89370400440532013000"
    assert hits[0].confidence >= 0.99


def test_iban_detector_accepts_valid_italian_iban():
    detector = IbanDetector()
    # Valid Italian IBAN (IT60 X054 2811 1010 0000 0123 456)
    hits = detector.detect("IBAN: IT60X0542811101000000123456")
    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.IBAN


def test_iban_detector_accepts_spaced_iban():
    detector = IbanDetector()
    hits = detector.detect("Pagamento a GB82 WEST 1234 5698 7654 32")
    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.IBAN


def test_iban_detector_rejects_invalid_checksum():
    detector = IbanDetector()
    # Same as valid DE IBAN but checksum changed to 00
    hits = detector.detect("DE00370400440532013000")
    assert hits == []


def test_iban_detector_rejects_random_alphanumeric():
    detector = IbanDetector()
    hits = detector.detect("Il codice è AB12XYZ9876543210")
    assert hits == []


def test_iban_detector_rejects_wrong_length_for_known_country():
    detector = IbanDetector()
    # DE should be 22 chars; 20 chars here
    hits = detector.detect("DE893704004405320130")
    assert hits == []


# ---------------------------------------------------------------------------
# Payment card
# ---------------------------------------------------------------------------

def test_payment_card_detector_accepts_visa():
    detector = PaymentCardDetector()
    hits = detector.detect("La mia carta è 4532015112830366.")
    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.PAYMENT_CARD
    assert "4532015112830366" in hits[0].original_text


def test_payment_card_detector_accepts_mastercard():
    detector = PaymentCardDetector()
    hits = detector.detect("Numero: 5425233430109903")
    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.PAYMENT_CARD


def test_payment_card_detector_accepts_amex():
    detector = PaymentCardDetector()
    hits = detector.detect("American Express: 378282246310005")
    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.PAYMENT_CARD


def test_payment_card_detector_accepts_dash_separated():
    detector = PaymentCardDetector()
    hits = detector.detect("Carta 4111-1111-1111-1111 scaduta.")
    assert len(hits) == 1


def test_payment_card_detector_accepts_space_separated():
    detector = PaymentCardDetector()
    hits = detector.detect("4111 1111 1111 1111")
    assert len(hits) == 1


def test_payment_card_detector_rejects_luhn_failure():
    detector = PaymentCardDetector()
    # Valid structure, invalid Luhn (last digit off)
    hits = detector.detect("4532015112830360")
    assert hits == []


def test_payment_card_detector_rejects_partita_iva_collision():
    """A valid Italian Partita IVA (11 digits) must NOT be flagged as a payment card."""
    detector = PaymentCardDetector()
    # 12345678903 is a valid PIVA; not a card because it has no known BIN prefix
    # and is not 15 or 16 digits
    hits = detector.detect("P.IVA 12345678903")
    assert hits == []


def test_payment_card_detector_rejects_short_number():
    detector = PaymentCardDetector()
    hits = detector.detect("Codice 123456789012")
    assert hits == []
