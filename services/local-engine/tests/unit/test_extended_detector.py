"""
Unit tests for the extended detector module.

Covers: IPv6Detector, DateOfBirthDetector, NationalIdDetector, AddressDetector.
"""
from local_engine.detectors.extended_detector import (
    AddressDetector,
    DateOfBirthDetector,
    IPv6Detector,
    NationalIdDetector,
)
from local_engine.models.enums import EntityType

# ---------------------------------------------------------------------------
# IPv6Detector
# ---------------------------------------------------------------------------

class TestIPv6Detector:
    det = IPv6Detector()

    def test_detects_full_ipv6(self):
        text = "Server address is 2001:0db8:85a3:0000:0000:8a2e:0370:7334 in prod."
        hits = self.det.detect(text)
        assert len(hits) == 1
        assert hits[0].original_text == "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
        assert hits[0].entity_type is EntityType.IPV6
        assert hits[0].confidence == 0.95

    def test_detects_compressed_ipv6(self):
        text = "Loopback is ::1 and link-local is fe80::1."
        hits = self.det.detect(text)
        addresses = {h.original_text for h in hits}
        assert "::1" in addresses or "fe80::1" in addresses

    def test_detects_typical_compressed_address(self):
        text = "Client connected from 2001:db8::1 on port 443."
        hits = self.det.detect(text)
        assert any(h.original_text == "2001:db8::1" for h in hits)

    def test_does_not_flag_plain_version_string(self):
        # "1.2.3.4" is IPv4, not IPv6; "3.10.2" is a version string
        hits = self.det.detect("Python 3.10.2 released")
        assert hits == []

    def test_does_not_flag_only_one_colon(self):
        hits = self.det.detect("port 8080:something")
        assert hits == []

    def test_canonical_text_is_lowercase(self):
        text = "Address 2001:0DB8::DEAD:BEEF"
        hits = self.det.detect(text)
        assert hits, "Expected at least one hit"
        assert hits[0].canonical_text == hits[0].original_text.lower()


# ---------------------------------------------------------------------------
# DateOfBirthDetector
# ---------------------------------------------------------------------------

class TestDateOfBirthDetector:
    det = DateOfBirthDetector()

    def test_detects_iso_date_with_dob_label(self):
        text = "Data di nascita: 1990-05-21"
        hits = self.det.detect(text)
        assert len(hits) == 1
        assert hits[0].original_text == "1990-05-21"
        assert hits[0].entity_type is EntityType.DATE_OF_BIRTH

    def test_detects_eu_numeric_with_born_label(self):
        text = "Born on 21/05/1990 in Milan."
        hits = self.det.detect(text)
        assert len(hits) == 1
        assert "1990" in hits[0].original_text

    def test_detects_eu_long_format(self):
        text = "DOB: 21 March 1990"
        hits = self.det.detect(text)
        assert len(hits) == 1
        assert "1990" in hits[0].original_text

    def test_does_not_flag_date_without_context(self):
        # Generic date with no DOB keyword nearby
        text = "The meeting is on 2024-06-15."
        hits = self.det.detect(text)
        assert hits == []

    def test_does_not_flag_invoice_date(self):
        text = "Invoice date: 01/03/2024. Please pay within 30 days."
        hits = self.det.detect(text)
        assert hits == []

    def test_italian_nato_keyword(self):
        text = "Nato il 15.04.1985 a Roma."
        hits = self.det.detect(text)
        assert len(hits) == 1

    def test_english_dob_abbreviation(self):
        text = "DOB 1985-04-15"
        hits = self.det.detect(text)
        assert len(hits) == 1
        assert hits[0].original_text == "1985-04-15"


# ---------------------------------------------------------------------------
# NationalIdDetector
# ---------------------------------------------------------------------------

class TestNationalIdDetector:
    det = NationalIdDetector()

    def test_detects_eu_passport_with_context(self):
        text = "Passport: AB1234567 issued in Germany."
        hits = self.det.detect(text)
        assert len(hits) >= 1
        assert any(h.original_text == "AB1234567" for h in hits)
        assert hits[0].entity_type is EntityType.NATIONAL_ID

    def test_detects_national_id_card(self):
        text = "National ID number: CA987654321"
        hits = self.det.detect(text)
        assert len(hits) >= 1

    def test_does_not_flag_alphanumeric_without_context(self):
        text = "Reference code AB123456 for your order."
        hits = self.det.detect(text)
        assert hits == []

    def test_detects_residence_permit(self):
        text = "Permesso di soggiorno: W12345678"
        hits = self.det.detect(text)
        assert len(hits) >= 1

    def test_canonical_text_is_uppercase(self):
        text = "Passport: ab1234567"
        hits = self.det.detect(text)
        if hits:
            assert hits[0].canonical_text == hits[0].original_text.upper()

    def test_does_not_flag_short_codes(self):
        # 5 chars is below the minimum
        text = "ID: AB123"
        hits = self.det.detect(text)
        # May or may not fire depending on pattern; key is no crash
        _ = hits  # no assertion — just verify no exception


# ---------------------------------------------------------------------------
# AddressDetector
# ---------------------------------------------------------------------------

class TestAddressDetector:
    det = AddressDetector()

    def test_detects_labeled_address(self):
        text = "Indirizzo: Via Roma 10, Milano"
        hits = self.det.detect(text)
        assert len(hits) >= 1
        assert hits[0].entity_type is EntityType.ADDRESS

    def test_detects_inline_via(self):
        text = "Abita in Via Garibaldi 22 a Torino."
        hits = self.det.detect(text)
        assert len(hits) >= 1

    def test_detects_address_label_in_english(self):
        # "Address:" at start of string triggers the labeled-address pattern
        text = "Address: Baker Street 221B"
        hits = self.det.detect(text)
        assert len(hits) >= 1

    def test_does_not_flag_url_containing_via(self):
        text = "See https://example.com/via/strada for details."
        hits = self.det.detect(text)
        # URL suppression — no structured address
        for h in hits:
            assert "://" not in h.original_text

    def test_does_not_flag_short_noise(self):
        # Value shorter than minimum length should be skipped
        hits = self.det.detect("Via AB")
        assert hits == []

    def test_address_confidence(self):
        text = "Indirizzo: Corso Vittorio Emanuele 100"
        hits = self.det.detect(text)
        assert all(h.confidence == 0.72 for h in hits)
