"""
Secrets and credentials detector.

Detects developer/operations sensitive data: API keys, bearer tokens, JWTs,
PEM private keys, database connection strings, .env-style secrets, and
well-known vendor-specific token formats (AWS, GitHub, GitLab, Stripe, npm,
Google Cloud).

All rules carry the "secrets:" prefix.  Confidence is set deliberately high
for patterns that include a structural checksum or a vendor-specific prefix,
and lower for generic labeled-context patterns that rely on keyword proximity.

No machine learning is used.  Detection is purely lexical and structural.
"""
from __future__ import annotations

import re

from local_engine.models.domain_models import RawFinding
from local_engine.models.enums import EntityType
from local_engine.utils.text_normalization import canonicalize_value


def _rule(
    name: str,
    pattern: str,
    confidence: float,
    rationale: str,
    flags: int = 0,
    value_group: int = 0,
) -> tuple[str, float, str, re.Pattern[str], int]:
    return (name, confidence, rationale, re.compile(pattern, flags), value_group)


# ---------------------------------------------------------------------------
# Vendor-specific token formats — high-entropy, vendor-prefixed, high confidence
# ---------------------------------------------------------------------------
_VENDOR_RULES = [
    _rule(
        "secrets:aws-access-key-id",
        r"(?<![A-Z0-9])(AKIA[0-9A-Z]{16})(?![A-Z0-9])",
        0.98,
        "AWS access key ID: vendor prefix AKIA + 16-char uppercase alphanumeric.",
    ),
    _rule(
        "secrets:aws-secret-access-key",
        r"(?i)\baws[_\-]?(?:secret[_\-]?)?access[_\-]?key\s*[:=]\s*([A-Za-z0-9/+]{40})\b",
        0.97,
        "AWS secret access key in labeled key=value context.",
        re.IGNORECASE,
        value_group=1,
    ),
    _rule(
        "secrets:github-pat-fine-grained",
        r"(?<![A-Za-z0-9_])(github_pat_[A-Za-z0-9_]{82})(?![A-Za-z0-9_])",
        0.99,
        "GitHub fine-grained personal access token.",
    ),
    _rule(
        "secrets:github-pat-classic",
        r"(?<![A-Za-z0-9_])(gh[pso]_[A-Za-z0-9]{36})(?![A-Za-z0-9_])",
        0.99,
        "GitHub classic personal access or OAuth token (ghp_, ghs_, gho_).",
    ),
    _rule(
        "secrets:gitlab-pat",
        r"(?<![A-Za-z0-9_])(glpat-[A-Za-z0-9_\-]{20})(?![A-Za-z0-9_])",
        0.99,
        "GitLab personal access token.",
    ),
    _rule(
        "secrets:stripe-secret-live",
        r"(?<![A-Za-z0-9_])(sk_live_[A-Za-z0-9]{24,})(?![A-Za-z0-9_])",
        0.99,
        "Stripe live secret API key.",
    ),
    _rule(
        "secrets:stripe-secret-test",
        r"(?<![A-Za-z0-9_])(sk_test_[A-Za-z0-9]{24,})(?![A-Za-z0-9_])",
        0.97,
        "Stripe test secret API key.",
    ),
    _rule(
        "secrets:stripe-pubkey-live",
        r"(?<![A-Za-z0-9_])(pk_live_[A-Za-z0-9]{24,})(?![A-Za-z0-9_])",
        0.95,
        "Stripe live publishable key (low risk by itself but confirms Stripe account).",
    ),
    _rule(
        "secrets:npm-auth-token",
        r"(?<![A-Za-z0-9_])(npm_[A-Za-z0-9]{36})(?![A-Za-z0-9_])",
        0.99,
        "npm automation or publish token.",
    ),
    _rule(
        "secrets:google-api-key",
        r"(?<![A-Za-z0-9_])(AIza[0-9A-Za-z_\-]{35})(?![A-Za-z0-9_])",
        0.99,
        "Google Cloud / Firebase API key (AIza prefix).",
    ),
    _rule(
        "secrets:slack-bot-token",
        r"(?<![A-Za-z0-9_])(xoxb-[0-9]{11,13}-[0-9]{11,13}-[A-Za-z0-9]{24})(?![A-Za-z0-9_])",
        0.99,
        "Slack bot OAuth token.",
    ),
    _rule(
        "secrets:slack-user-token",
        r"(?<![A-Za-z0-9_])(xoxp-[0-9]{11,13}-[0-9]{11,13}-[0-9]{11,13}-[A-Za-z0-9]{32})(?![A-Za-z0-9_])",
        0.99,
        "Slack user OAuth token.",
    ),
    _rule(
        "secrets:twilio-api-key",
        r"(?<![A-Za-z0-9_])(SK[0-9a-f]{32})(?![A-Za-z0-9_])",
        0.96,
        "Twilio API key SID.",
    ),
    _rule(
        "secrets:sendgrid-api-key",
        r"(?<![A-Za-z0-9_])(SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43})(?![A-Za-z0-9_])",
        0.99,
        "SendGrid API key (SG. prefix + two segments).",
    ),
    _rule(
        "secrets:azure-storage-key",
        r"(?i)(?:AccountKey|SharedAccessSignature)\s*=\s*([A-Za-z0-9+/]{88}==)",
        0.97,
        "Azure storage account key or SAS credential.",
        re.IGNORECASE,
        value_group=1,
    ),
]

# ---------------------------------------------------------------------------
# JWT — three base64url segments separated by dots
# ---------------------------------------------------------------------------
_B64URL_SEGMENT = r"[A-Za-z0-9_\-]+"
_JWT_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9_\-])({_B64URL_SEGMENT}\.{_B64URL_SEGMENT}\.{_B64URL_SEGMENT})(?![A-Za-z0-9_\-\.])",
)


def _looks_like_jwt(value: str) -> bool:
    """A valid JWT has exactly 2 dots; each segment is non-empty base64url."""
    parts = value.split(".")
    if len(parts) != 3:
        return False
    # Header must decode to {"alg":..., "typ":"JWT"} — check for base64url
    # of at least a minimal size (header ~20+ chars, payload ~20+ chars, sig ~43+)
    return all(len(p) >= 10 for p in parts)


# ---------------------------------------------------------------------------
# PEM private keys
# ---------------------------------------------------------------------------
_PEM_PATTERN = re.compile(
    r"(-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|DSA\s+|)?PRIVATE KEY-----"
    r"(?:.|\n)*?"
    r"-----END\s+(?:RSA\s+|EC\s+|OPENSSH\s+|DSA\s+|)?PRIVATE KEY-----)",
    re.DOTALL,
)

# ---------------------------------------------------------------------------
# Bearer / Authorization header tokens
# ---------------------------------------------------------------------------
_BEARER_PATTERN = re.compile(
    r"(?i)\bBearer\s+([A-Za-z0-9._~+/=\-]{20,})",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Database / DSN / connection strings
# ---------------------------------------------------------------------------
_CONNSTR_PATTERN = re.compile(
    r"(?i)\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql|sqlserver|oracle|jdbc:"
    r"(?:postgresql|mysql|oracle|sqlserver))"
    r"://[^\s<>\"'`\x00-\x1f]{8,})",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# .env / configuration file secrets — labeled key=value patterns
# ---------------------------------------------------------------------------
_ENV_SECRET_KEYWORDS = (
    r"(?:secret(?:_key)?|password|passwd|pwd|api[_\-]?key|access[_\-]?token"
    r"|auth[_\-]?token|oauth[_\-]?token|private[_\-]?key|encryption[_\-]?key"
    r"|signing[_\-]?key|service[_\-]?account|client[_\-]?secret|app[_\-]?secret"
    r"|database[_\-]?password|db[_\-]?password|smtp[_\-]?password)"
)
_ENV_PATTERN = re.compile(
    rf"(?i)(?:^|[;\n,{{])\s*(?:[A-Z_]{{0,40}})?{_ENV_SECRET_KEYWORDS}"
    rf"\s*[=:]\s*([^\s,;\"'`\n]{{8,}})",
    re.IGNORECASE | re.MULTILINE,
)

# ---------------------------------------------------------------------------
# Generic high-entropy hex / base64 secrets in labeled context
# ---------------------------------------------------------------------------
_LABELED_HEX_PATTERN = re.compile(
    r"(?i)\b(?:token|key|secret|hash|salt|nonce|iv|hmac)\s*[:=]\s*([0-9a-f]{32,})\b",
    re.IGNORECASE,
)


class SecretsDetector:
    """
    Detects secrets and credentials using structural patterns.

    This detector has zero false-negative tolerance for high-confidence
    vendor-prefixed tokens and PEM keys.  It uses keyword context windows
    to reduce false positives on generic patterns (Bearer, .env, hex).
    """

    name = "secrets:detector"

    def detect(self, text: str) -> list[RawFinding]:
        findings: list[RawFinding] = []

        # 1. Vendor-specific tokens (high confidence, structural)
        for name, confidence, rationale, pattern, vgroup in _VENDOR_RULES:
            for match in pattern.finditer(text):
                original = match.group(vgroup).strip()
                if not original:
                    continue
                findings.append(
                    RawFinding(
                        entity_type=EntityType.SECRET,
                        detector=name,
                        original_text=original,
                        canonical_text=canonicalize_value(EntityType.SECRET, original),
                        start=match.start(vgroup),
                        end=match.end(vgroup),
                        confidence=confidence,
                        rationale=rationale,
                    )
                )

        # 2. JWT
        for match in _JWT_PATTERN.finditer(text):
            value = match.group(1)
            if _looks_like_jwt(value):
                findings.append(
                    RawFinding(
                        entity_type=EntityType.SECRET,
                        detector="secrets:jwt",
                        original_text=value,
                        canonical_text=canonicalize_value(EntityType.SECRET, value),
                        start=match.start(1),
                        end=match.end(1),
                        confidence=0.93,
                        rationale=(
                            "JSON Web Token: three base64url-encoded"
                            " segments separated by dots."
                        ),
                    )
                )

        # 3. PEM private keys
        for match in _PEM_PATTERN.finditer(text):
            value = match.group(1)
            findings.append(
                RawFinding(
                    entity_type=EntityType.SECRET,
                    detector="secrets:pem-private-key",
                    original_text=value,
                    canonical_text=canonicalize_value(EntityType.SECRET, value),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=0.99,
                    rationale="PEM-encoded private key block.",
                )
            )

        # 4. Bearer tokens
        for match in _BEARER_PATTERN.finditer(text):
            value = match.group(1)
            # Skip if already captured as JWT (to avoid double-reporting)
            if _looks_like_jwt(value):
                continue
            findings.append(
                RawFinding(
                    entity_type=EntityType.SECRET,
                    detector="secrets:bearer-token",
                    original_text=value,
                    canonical_text=canonicalize_value(EntityType.SECRET, value),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=0.88,
                    rationale="HTTP Authorization Bearer token value.",
                )
            )

        # 5. Connection strings / DSNs
        for match in _CONNSTR_PATTERN.finditer(text):
            value = match.group(1)
            findings.append(
                RawFinding(
                    entity_type=EntityType.SECRET,
                    detector="secrets:connection-string",
                    original_text=value,
                    canonical_text=canonicalize_value(EntityType.SECRET, value),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=0.95,
                    rationale=(
                        "Database or service connection string (DSN)"
                        " containing potential credentials."
                    ),
                )
            )

        # 6. .env / config file secrets
        for match in _ENV_PATTERN.finditer(text):
            value = match.group(1)
            if not value or value.lower() in {"true", "false", "null", "none", "yes", "no"}:
                continue
            findings.append(
                RawFinding(
                    entity_type=EntityType.SECRET,
                    detector="secrets:env-secret",
                    original_text=value,
                    canonical_text=canonicalize_value(EntityType.SECRET, value),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=0.82,
                    rationale=(
                        "Secret-like value in labeled configuration"
                        " context (key=value pattern)."
                    ),
                )
            )

        # 7. Labeled hex secrets
        for match in _LABELED_HEX_PATTERN.finditer(text):
            value = match.group(1)
            findings.append(
                RawFinding(
                    entity_type=EntityType.SECRET,
                    detector="secrets:labeled-hex",
                    original_text=value,
                    canonical_text=canonicalize_value(EntityType.SECRET, value),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=0.78,
                    rationale="High-entropy hex value in labeled secret context.",
                )
            )

        return findings
