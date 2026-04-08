"""
Extended detector module.

Provides detectors for entity types that have enum values and pseudonymiser
prefixes defined but previously had no concrete detection implementation:

  - IPv6 addresses
  - Dates of birth (ISO 8601 and common European formats, in labeled contexts)
  - National identifiers beyond Italy (EU passports, generic labeled ID)
  - Street addresses (labeled-context only, conservative FP control)

These detectors use the same ``RawFinding`` interface as all other detectors.
Rule prefix for this module: ``extended:``.

Detection philosophy
--------------------
All rules here are deliberately conservative:
- IPv6: structural pattern only (matches valid hex colon notation)
- DOB: requires an explicit date-of-birth context keyword
- NATIONAL_ID: requires an explicit national-ID context keyword
- ADDRESS: requires an explicit address context keyword; full-address
  pattern matching is fragile, so the detector catches only labeled occurrences

A future local-NER or address-parsing library can replace the ADDRESS detector
with a higher-recall alternative; the entity type and placeholder prefix are
already wired in.
"""
from __future__ import annotations

import re

from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType
from local_engine.utils.text_normalization import canonicalize_value

# ---------------------------------------------------------------------------
# IPv6
# ---------------------------------------------------------------------------
# Covers:
#   - Full 8-group notation: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
#   - Compressed notation:   2001:db8::1
#   - Loopback / link-local are still captured (they may appear in logs)
# The pattern avoids matching version strings (e.g. "1.2.3") by requiring the
# two-hex-digit:two-hex-digit structure of IPv6.
_IPV6_FULL = re.compile(
    r"\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b"
)
# Compressed notation (contains "::")
_IPV6_COMPRESSED = re.compile(
    r"\b(?:[0-9a-fA-F]{0,4}:){2,7}(?:[0-9a-fA-F]{0,4})\b"
)


def _looks_like_ipv6(value: str) -> bool:
    """Sanity-check: must contain at least two colons and only valid chars."""
    if value.count(":") < 2:
        return False
    stripped = value.replace(":", "").replace(".", "")
    if not stripped:
        return False
    try:
        import ipaddress  # noqa: PLC0415
        ipaddress.IPv6Address(value)
        return True
    except ValueError:
        return False


class IPv6Detector:
    """Detects IPv6 addresses using structural pattern matching."""

    name = "extended:ipv6"

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        seen: set[tuple[int, int]] = set()

        for pattern in (_IPV6_FULL, _IPV6_COMPRESSED):
            for match in pattern.finditer(text):
                value = match.group(0)
                if not _looks_like_ipv6(value):
                    continue
                span = (match.start(), match.end())
                if span in seen:
                    continue
                seen.add(span)
                findings.append(
                    RawFinding(
                        entity_type=EntityType.IPV6,
                        detector=self.name,
                        original_text=value,
                        canonical_text=value.lower(),
                        start=match.start(),
                        end=match.end(),
                        confidence=0.95,
                        rationale="IPv6 address — structural pattern match.",
                    )
                )
        return findings


# ---------------------------------------------------------------------------
# Date of birth
# ---------------------------------------------------------------------------
# Strategy: require an explicit DOB context keyword before or after the date.
# This suppresses generic date false positives (invoice dates, meeting dates,
# version dates, etc.).
#
# Supported date formats:
#   ISO 8601:         2000-04-15, 2000/04/15
#   European long:    15 April 2000, 15 aprile 2000
#   European numeric: 15.04.2000, 15/04/2000, 15-04-2000
#   Month-first US:   04/15/2000 (ambiguous, only when context present)

_DOB_CONTEXT_PATTERN = re.compile(
    r"\b(?:"
    r"dat[ae]\s*(?:di\s*)?nasc(?:ita)?|"
    r"d\.?o\.?b\.?|"
    r"date\s*of\s*birth|"
    r"born(?:\s*on)?|"
    r"nato[/a]?\s*(?:il)?|"
    r"birthday|"
    r"birth\s*date|"
    r"birthdate|"
    r"dob"
    r")\b",
    re.IGNORECASE,
)

_MONTHS_EN = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|"
    r"may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|"
    r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_MONTHS_IT = (
    r"(?:gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|"
    r"mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|"
    r"set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?)"
)
_MONTHS = rf"(?:{_MONTHS_EN}|{_MONTHS_IT})"

# Three date sub-patterns captured in group 1
_DATE_ISO = r"(\d{4}[/\-]\d{2}[/\-]\d{2})"
_DATE_EU_LONG = rf"(\d{{1,2}}\s+{_MONTHS}\s+\d{{4}})"
_DATE_EU_NUM = r"(\d{1,2}[./\-]\d{1,2}[./\-]\d{4})"

_DOB_DATE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(_DATE_ISO, re.IGNORECASE),
    re.compile(_DATE_EU_LONG, re.IGNORECASE),
    re.compile(_DATE_EU_NUM, re.IGNORECASE),
]

_CONTEXT_WINDOW = 60  # chars before/after the date to search for context keyword


class DateOfBirthDetector:
    """
    Detects dates of birth in labeled contexts.

    A date is only flagged when an explicit date-of-birth keyword appears
    within ``_CONTEXT_WINDOW`` characters of the date value.  This
    suppresses false positives on generic dates (meeting invites, etc.).
    """

    name = "extended:date-of-birth"

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        seen_spans: set[tuple[int, int]] = set()

        for pattern in _DOB_DATE_PATTERNS:
            for match in pattern.finditer(text):
                span = (match.start(1), match.end(1))
                if span in seen_spans:
                    continue
                value = match.group(1)
                # Look for context keyword in window around the date
                window_start = max(0, match.start() - _CONTEXT_WINDOW)
                window_end = min(len(text), match.end() + _CONTEXT_WINDOW)
                context = text[window_start:window_end]
                if not _DOB_CONTEXT_PATTERN.search(context):
                    continue
                seen_spans.add(span)
                findings.append(
                    RawFinding(
                        entity_type=EntityType.DATE_OF_BIRTH,
                        detector=self.name,
                        original_text=value,
                        canonical_text=canonicalize_value(
                            EntityType.DATE_OF_BIRTH, value
                        ),
                        start=match.start(1),
                        end=match.end(1),
                        confidence=0.88,
                        rationale=(
                            "Date of birth detected via explicit label context "
                            "(e.g. 'data di nascita', 'DOB', 'date of birth')."
                        ),
                    )
                )
        return findings


# ---------------------------------------------------------------------------
# National identifier (non-Italian)
# ---------------------------------------------------------------------------
# Covers:
#   - EU-style passport numbers: 2 letter country code + 7–9 alphanumeric
#   - Generic national ID in labeled context: labeled "ID:", "passport:",
#     "national ID:", etc. + alphanumeric code
# False positive control: requires explicit keyword context.

_NID_CONTEXT_PATTERN = re.compile(
    r"\b(?:"
    r"passport(?:\s*(?:no|number|#|num))?|"
    r"national\s*id(?:\s*(?:no|number|#|card))?|"
    r"id\s*(?:card|number|no|nazionale)|"
    r"carta\s*d[''']identit[àa]|"
    r"c\.?i\.?|"
    r"tessera\s*(?:sanitaria|identit[àa])|"
    r"permesso\s*di\s*soggiorno|"
    r"residence\s*permit|"
    r"driver[''']?s?\s*licen[cs]e|"
    r"patente(?:\s*di\s*guida)?|"
    r"social\s*security(?:\s*(?:no|number))?|"
    r"ssn|"
    r"nin\b"
    r")\b",
    re.IGNORECASE,
)

# Generic value patterns (captured in group 1)
_NID_VALUE_PATTERNS: list[re.Pattern[str]] = [
    # EU passport: 2 uppercase letters + 7 to 9 digits/letters
    re.compile(r"\b([A-Z]{1,2}[0-9]{6,9})\b"),
    # Alphanumeric ID: letter + digits + optional letters (generic)
    re.compile(r"\b([A-Z][A-Z0-9]{5,15})\b"),
]

_NID_CONTEXT_WINDOW = 60


class NationalIdDetector:
    """
    Detects national identifiers (passports, residency cards, etc.) in
    labeled contexts.  Only fires when an explicit keyword is present within
    ``_NID_CONTEXT_WINDOW`` characters.
    """

    name = "extended:national-id"

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        seen_spans: set[tuple[int, int]] = set()

        for pattern in _NID_VALUE_PATTERNS:
            for match in pattern.finditer(text):
                span = (match.start(1), match.end(1))
                if span in seen_spans:
                    continue
                value = match.group(1)
                window_start = max(0, match.start() - _NID_CONTEXT_WINDOW)
                window_end = min(len(text), match.end() + _NID_CONTEXT_WINDOW)
                context = text[window_start:window_end]
                if not _NID_CONTEXT_PATTERN.search(context):
                    continue
                seen_spans.add(span)
                findings.append(
                    RawFinding(
                        entity_type=EntityType.NATIONAL_ID,
                        detector=self.name,
                        original_text=value,
                        canonical_text=value.upper(),
                        start=match.start(1),
                        end=match.end(1),
                        confidence=0.82,
                        rationale=(
                            "National identifier detected via explicit label "
                            "(passport, national ID, residence permit, etc.)."
                        ),
                    )
                )
        return findings


# ---------------------------------------------------------------------------
# Address (labeled context only)
# ---------------------------------------------------------------------------
# Full address parsing is extremely fragile and locale-dependent.  The
# conservative approach: only capture text that follows an explicit address
# label.  The matched value is everything up to the next sentence boundary
# or end of line.
#
# Supported labels: via, viale, corso, piazza, str., street, road, avenue,
#   address, indirizzo, etc.

_ADDR_LABEL_PATTERN = re.compile(
    r"(?:^|\n|[,;])\s*"
    r"(?:indirizzo|address(?:e)?|via(?:\s+[A-Z]|$)|viale|corso|piazza|"
    r"str(?:eet)?\.?|road|avenue|ave\.?|blvd\.?|boulevard|"
    r"via\s+[A-Za-zÀ-ÖØ-öø-ÿ]|v\.le|p\.za)\s*[:.-]?\s*"
    r"([^\n,;]{8,80})",
    re.IGNORECASE | re.MULTILINE,
)

_INLINE_ADDR_PATTERN = re.compile(
    r"\b(?:via|viale|corso|piazza|str(?:eet)?\.?|road|avenue|ave\.?|blvd\.?)\s+"
    r"([A-ZÀ-ÖØ-öø-ÿ][^\n,;]{4,50}(?:\d+[^\n,;]{0,20})?)",
    re.IGNORECASE,
)


class AddressDetector:
    """
    Conservative address detector.

    Fires only when an explicit address label precedes the value, or when
    a common street-type word (Via, Viale, etc.) begins a standalone
    address-like phrase.  The captured text is trimmed to avoid consuming
    the entire sentence.
    """

    name = "extended:address"

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        seen_spans: set[tuple[int, int]] = set()

        for pattern in (_ADDR_LABEL_PATTERN, _INLINE_ADDR_PATTERN):
            for match in pattern.finditer(text):
                value = match.group(1).strip().rstrip(".,;:")
                if len(value) < 5:
                    continue
                span = (match.start(1), match.start(1) + len(value))
                if span in seen_spans:
                    continue
                # Suppress if value looks like a URL or email
                if "@" in value or "://" in value:
                    continue
                # Suppress if it's pure punctuation/numbers
                if not any(c.isalpha() for c in value):
                    continue
                seen_spans.add(span)
                findings.append(
                    RawFinding(
                        entity_type=EntityType.ADDRESS,
                        detector=self.name,
                        original_text=value,
                        canonical_text=canonicalize_value(
                            EntityType.ADDRESS, value
                        ),
                        start=span[0],
                        end=span[1],
                        confidence=0.72,
                        rationale=(
                            "Street address detected via explicit label or "
                            "street-type keyword (via, viale, street, etc.)."
                        ),
                    )
                )
        return findings
