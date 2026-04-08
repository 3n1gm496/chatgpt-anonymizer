"""
Financial identifier detector.

Detects IBAN codes (with MOD-97 checksum validation) and payment card numbers
(with Luhn algorithm validation).  Both detectors use hard structural validators
to keep false-positive rates negligible.

Rule prefix: "financial:"
"""
from __future__ import annotations

import re

from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType
from local_engine.utils.text_normalization import canonicalize_value

# ---------------------------------------------------------------------------
# IBAN
# ---------------------------------------------------------------------------
# Country-specific length table (ISO 13616).  Unknown countries still pass the
# pattern but are validated with a looser length bound.
_IBAN_LENGTHS: dict[str, int] = {
    "AL": 28, "AD": 24, "AT": 20, "AZ": 28, "BH": 22, "BY": 28,
    "BE": 16, "BA": 20, "BR": 29, "BG": 22, "CR": 22, "HR": 21,
    "CY": 28, "CZ": 24, "DK": 18, "DO": 28, "EG": 29, "SV": 28,
    "EE": 20, "FO": 18, "FI": 18, "FR": 27, "GE": 22, "DE": 22,
    "GI": 23, "GR": 27, "GL": 18, "GT": 28, "HU": 28, "IS": 26,
    "IQ": 23, "IE": 22, "IL": 23, "IT": 27, "JO": 30, "KZ": 20,
    "XK": 20, "KW": 30, "LV": 21, "LB": 28, "LI": 21, "LT": 20,
    "LU": 20, "MK": 19, "MT": 31, "MR": 27, "MU": 30, "MD": 24,
    "MC": 27, "ME": 22, "NL": 18, "NO": 15, "PK": 24, "PS": 29,
    "PL": 28, "PT": 25, "QA": 29, "RO": 24, "LC": 32, "SM": 27,
    "ST": 25, "SA": 24, "RS": 22, "SC": 31, "SK": 24, "SI": 19,
    "ES": 24, "SD": 18, "SE": 24, "CH": 21, "TL": 23, "TN": 24,
    "TR": 26, "UA": 29, "AE": 23, "GB": 22, "VA": 22, "VG": 24,
}

# Matches IBANs with or without spaces (groups of 4).
# The optional space is placed BEFORE each 4-char group so that the common
# printed form "CC## AAAA BBBB …" (space after the two check digits too) is
# captured.  Previous pattern placed the space AFTER, which missed the gap
# between the check digits and the first data group.
_IBAN_RAW_PATTERN = re.compile(
    r"\b([A-Z]{2}[0-9]{2}(?:\s?[A-Z0-9]{4})*\s?[A-Z0-9]{1,4})\b",
    re.IGNORECASE,
)


def _validate_iban(value: str) -> bool:
    """
    Full MOD-97 IBAN validation per ISO 13616.

    1. Remove spaces, uppercase.
    2. Check country-specific length if known.
    3. Move first 4 chars to end.
    4. Convert letters A-Z to numbers 10-35.
    5. Compute numeric_string mod 97; must equal 1.
    """
    iban = value.replace(" ", "").upper()
    country = iban[:2]

    # Basic character set
    if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]+", iban):
        return False

    # Length check
    expected_length = _IBAN_LENGTHS.get(country)
    if expected_length is not None and len(iban) != expected_length:
        return False
    elif expected_length is None and (len(iban) < 15 or len(iban) > 34):
        return False

    # MOD-97
    rearranged = iban[4:] + iban[:4]
    numeric = ""
    for char in rearranged:
        if char.isdigit():
            numeric += char
        else:
            numeric += str(ord(char) - ord("A") + 10)

    return int(numeric) % 97 == 1


class IbanDetector:
    """Detects IBAN codes with MOD-97 checksum validation."""

    name = "financial:iban"

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        for match in _IBAN_RAW_PATTERN.finditer(text):
            raw = match.group(1)
            normalised = raw.replace(" ", "").upper()
            if len(normalised) < 15:
                continue
            if not _validate_iban(normalised):
                continue
            findings.append(
                RawFinding(
                    entity_type=EntityType.IBAN,
                    detector=self.name,
                    original_text=raw,
                    canonical_text=canonicalize_value(EntityType.IBAN, normalised),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=0.99,
                    rationale="IBAN validated with MOD-97 checksum (ISO 13616).",
                )
            )
        return findings


# ---------------------------------------------------------------------------
# Payment card numbers (PAN)
# ---------------------------------------------------------------------------
# Pattern captures digit-only or space/dash/dot separated groups of 4
_CARD_PATTERN = re.compile(
    r"\b(\d{4}[\s\-\.]?\d{4}[\s\-\.]?\d{4}[\s\-\.]?\d{1,4}(?:[\s\-\.]?\d{1,4})?)\b"
)

# Major card BIN prefixes (used only as a soft filter before Luhn)
_CARD_BIN_PATTERNS = (
    re.compile(r"^4"),                          # Visa
    re.compile(r"^5[1-5]"),                     # Mastercard classic
    re.compile(r"^2[2-7]"),                     # Mastercard new range
    re.compile(r"^3[47]"),                      # Amex
    re.compile(r"^3(?:0[0-5]|[68])"),          # Diners
    re.compile(r"^6(?:011|5)"),                 # Discover
    re.compile(r"^(?:2131|1800|35\d{3})"),     # JCB
    re.compile(r"^(?:4026|417500|4508|4844|491[37])"),  # Visa Electron
)


def _validate_luhn(digits: str) -> bool:
    """Standard Luhn checksum validation."""
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _matches_known_bin(digits: str) -> bool:
    return any(p.match(digits) for p in _CARD_BIN_PATTERNS)


class PaymentCardDetector:
    """
    Detects payment card numbers (PAN) using Luhn algorithm validation.

    A match is only emitted when:
    1. The digit string is 13–19 digits long.
    2. It passes the Luhn checksum.
    3. It matches at least one known BIN prefix, OR has 15/16 digits.

    This conservative policy keeps false positives (e.g. Italian Partita IVA,
    phone numbers, ticket IDs) very low.
    """

    name = "financial:payment-card"

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        for match in _CARD_PATTERN.finditer(text):
            raw = match.group(1)
            digits = re.sub(r"\D", "", raw)
            if len(digits) < 13 or len(digits) > 19:
                continue
            if not _validate_luhn(digits):
                continue
            # Require either a known BIN prefix or a length typical for cards
            if not (_matches_known_bin(digits) or len(digits) in {15, 16}):
                continue
            confidence = 0.96 if _matches_known_bin(digits) else 0.88
            findings.append(
                RawFinding(
                    entity_type=EntityType.PAYMENT_CARD,
                    detector=self.name,
                    original_text=raw,
                    canonical_text=canonicalize_value(EntityType.PAYMENT_CARD, digits),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=confidence,
                    rationale="Payment card PAN validated with Luhn algorithm.",
                )
            )
        return findings
