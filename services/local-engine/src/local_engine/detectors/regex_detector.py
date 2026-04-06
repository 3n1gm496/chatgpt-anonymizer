from __future__ import annotations

import re
from collections.abc import Callable
from ipaddress import ip_address

from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType
from local_engine.utils.text_normalization import canonicalize_value

Validator = Callable[..., bool]


class RegexDetector:
    def __init__(
        self,
        entity_type: EntityType,
        detector_name: str,
        pattern: str,
        confidence: float,
        flags: int = re.IGNORECASE,
        validator: Validator | None = None,
        rationale: str | None = None,
        value_group: int = 0,
    ):
        self.entity_type = entity_type
        self.name = detector_name
        self.pattern = re.compile(pattern, flags)
        self.confidence = confidence
        self.validator = validator
        self.rationale = rationale
        self.value_group = value_group

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []
        for match in self.pattern.finditer(text):
            value = match.group(self.value_group)
            if self.validator and not _run_validator(self.validator, value, text, match):
                continue
            findings.append(
                RawFinding(
                    entity_type=self.entity_type,
                    detector=self.name,
                    original_text=value,
                    canonical_text=canonicalize_value(self.entity_type, value),
                    start=match.start(self.value_group),
                    end=match.end(self.value_group),
                    confidence=self.confidence,
                    rationale=self.rationale,
                )
            )
        return findings


def _run_validator(
    validator: Validator,
    value: str,
    text: str,
    match: re.Match[str],
) -> bool:
    code = getattr(validator, "__code__", None)
    if code is not None and code.co_argcount >= 3:
        return bool(validator(value, text, match))
    return bool(validator(value))


def _validate_ipv4(value: str) -> bool:
    try:
        ip = ip_address(value)
    except ValueError:
        return False
    return not ip.is_loopback and not ip.is_multicast and not ip.is_unspecified


_CF_ODD = {
    "0": 1,
    "1": 0,
    "2": 5,
    "3": 7,
    "4": 9,
    "5": 13,
    "6": 15,
    "7": 17,
    "8": 19,
    "9": 21,
    "A": 1,
    "B": 0,
    "C": 5,
    "D": 7,
    "E": 9,
    "F": 13,
    "G": 15,
    "H": 17,
    "I": 19,
    "J": 21,
    "K": 2,
    "L": 4,
    "M": 18,
    "N": 20,
    "O": 11,
    "P": 3,
    "Q": 6,
    "R": 8,
    "S": 12,
    "T": 14,
    "U": 16,
    "V": 10,
    "W": 22,
    "X": 25,
    "Y": 24,
    "Z": 23,
}
_CF_EVEN = {
    char: (int(char) if char.isdigit() else ord(char) - ord("A"))
    for char in "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
}


def _validate_codice_fiscale(value: str) -> bool:
    candidate = value.upper()
    if not re.fullmatch(r"[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]", candidate):
        return False
    total = sum(
        _CF_ODD[char] if index % 2 == 0 else _CF_EVEN[char]
        for index, char in enumerate(candidate[:15])
    )
    return candidate[-1] == chr(ord("A") + total % 26)


def _validate_partita_iva(value: str) -> bool:
    if not re.fullmatch(r"\d{11}", value):
        return False
    total = 0
    for index, char in enumerate(value[:10]):
        digit = int(char)
        if index % 2 == 0:
            total += digit
        else:
            doubled = digit * 2
            total += doubled if doubled < 10 else doubled - 9
    return (10 - (total % 10)) % 10 == int(value[10])


_PHONE_KEYWORD_PATTERN = re.compile(
    r"\b(?:tel|telefono|mobile|cell(?:ulare)?|contatto|whatsapp|phone|call|sms|fax)\b",
    re.IGNORECASE,
)


def _validate_phone(
    value: str,
    text: str,
    match: re.Match[str],
) -> bool:
    candidate = value.strip()
    digits = re.sub(r"\D", "", candidate)
    if len(digits) < 7 or len(digits) > 15:
        return False

    if re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", candidate):
        return False

    if re.fullmatch(r"\d+(?:\.\d+){2,}", candidate):
        return False

    if re.search(r"[+\s().-]", candidate):
        return True

    context = text[max(0, match.start() - 24) : min(len(text), match.end() + 24)]
    return len(digits) >= 9 and bool(_PHONE_KEYWORD_PATTERN.search(context))


def build_default_regex_detectors() -> list[RegexDetector]:
    return [
        RegexDetector(
            entity_type=EntityType.EMAIL,
            detector_name="regex:email",
            pattern=r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
            confidence=0.96,
            flags=0,
        ),
        RegexDetector(
            entity_type=EntityType.IPV4,
            detector_name="regex:ipv4",
            pattern=r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
            confidence=0.97,
            flags=0,
            validator=_validate_ipv4,
        ),
        RegexDetector(
            entity_type=EntityType.URL,
            detector_name="regex:url",
            pattern=r"\bhttps?://[^\s<>\"]+",
            confidence=0.92,
            flags=re.IGNORECASE,
        ),
        RegexDetector(
            entity_type=EntityType.HOSTNAME,
            detector_name="regex:hostname",
            pattern=r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,5}[a-z]{2,}\b",
            confidence=0.74,
            flags=re.IGNORECASE,
            rationale="Hostname matching can be ambiguous outside URL context.",
        ),
        RegexDetector(
            entity_type=EntityType.PHONE,
            detector_name="regex:phone",
            pattern=r"(?:(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d(?:[ .-]?\d){5,})",
            confidence=0.82,
            flags=0,
            validator=_validate_phone,
            rationale=(
                "Phone numbers are detected conservatively"
                " to avoid ticket or version false positives."
            ),
        ),
        RegexDetector(
            entity_type=EntityType.USERNAME,
            detector_name="regex:username-handle",
            pattern=r"(?<![\w@])(@[A-Za-z0-9_](?:[A-Za-z0-9_.-]{1,30}[A-Za-z0-9_])?)\b",
            confidence=0.78,
            flags=0,
            rationale=(
                "Username-like handles are only protected when they look like explicit mentions."
            ),
            value_group=1,
        ),
        RegexDetector(
            entity_type=EntityType.PERSON,
            detector_name="regex:labeled-person",
            pattern=(
                r"\b(?:nome|name|contatto|referente|cliente|customer)\s*[:\-]\s*"
                r"([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'`-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'`-]+){1,2})"
            ),
            confidence=0.74,
            flags=re.IGNORECASE,
            rationale="Person names are only detected in explicit labeled contexts.",
            value_group=1,
        ),
        RegexDetector(
            entity_type=EntityType.CODICE_FISCALE,
            detector_name="regex:codice-fiscale",
            pattern=r"\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b",
            confidence=0.98,
            flags=0,
            validator=_validate_codice_fiscale,
        ),
        RegexDetector(
            entity_type=EntityType.PARTITA_IVA,
            detector_name="regex:partita-iva",
            pattern=r"\b\d{11}\b",
            confidence=0.95,
            flags=0,
            validator=_validate_partita_iva,
        ),
    ]
