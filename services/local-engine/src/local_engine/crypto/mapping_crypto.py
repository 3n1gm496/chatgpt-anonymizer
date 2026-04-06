from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

LEGACY_MAGIC = b"CGA1"
LEGACY_VERSION = b"\x01"
FORMAT_MAGIC = b"CGA2"
FORMAT_VERSION = b"\x02"
NONCE_SIZE = 12
RECORD_SALT_SIZE = 16
LEGACY_HEADER_SIZE = len(LEGACY_MAGIC) + len(LEGACY_VERSION) + NONCE_SIZE
HEADER_SIZE = len(FORMAT_MAGIC) + len(FORMAT_VERSION) + RECORD_SALT_SIZE + NONCE_SIZE


@dataclass(frozen=True)
class EncryptedPayloadEnvelope:
    version: int
    record_salt: bytes
    nonce: bytes
    ciphertext: bytes


def encrypt_payload(
    payload: dict[str, Any], data_encryption_key: bytes, record_salt: bytes
) -> bytes:
    nonce = os.urandom(NONCE_SIZE)
    plaintext = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = AESGCM(data_encryption_key).encrypt(nonce, plaintext, None)
    return FORMAT_MAGIC + FORMAT_VERSION + record_salt + nonce + ciphertext


def unpack_envelope(blob: bytes) -> EncryptedPayloadEnvelope:
    if blob[: len(FORMAT_MAGIC)] == FORMAT_MAGIC:
        if len(blob) < HEADER_SIZE + 16:
            raise ValueError("Encrypted payload is too short.")
        if blob[len(FORMAT_MAGIC) : len(FORMAT_MAGIC) + len(FORMAT_VERSION)] != FORMAT_VERSION:
            raise ValueError("Encrypted payload version is unsupported.")
        record_salt_start = len(FORMAT_MAGIC) + len(FORMAT_VERSION)
        record_salt_end = record_salt_start + RECORD_SALT_SIZE
        nonce_end = record_salt_end + NONCE_SIZE
        return EncryptedPayloadEnvelope(
            version=2,
            record_salt=blob[record_salt_start:record_salt_end],
            nonce=blob[record_salt_end:nonce_end],
            ciphertext=blob[nonce_end:],
        )

    if blob[: len(LEGACY_MAGIC)] == LEGACY_MAGIC:
        if len(blob) < LEGACY_HEADER_SIZE + 16:
            raise ValueError("Encrypted payload is too short.")
        if blob[len(LEGACY_MAGIC) : len(LEGACY_MAGIC) + len(LEGACY_VERSION)] != LEGACY_VERSION:
            raise ValueError("Encrypted payload version is unsupported.")
        nonce_start = len(LEGACY_MAGIC) + len(LEGACY_VERSION)
        nonce_end = nonce_start + NONCE_SIZE
        return EncryptedPayloadEnvelope(
            version=1,
            record_salt=b"",
            nonce=blob[nonce_start:nonce_end],
            ciphertext=blob[nonce_end:],
        )

    raise ValueError("Encrypted payload magic header is invalid.")


def decrypt_payload(blob: bytes, data_encryption_key: bytes) -> dict[str, Any]:
    envelope = unpack_envelope(blob)
    plaintext = AESGCM(data_encryption_key).decrypt(envelope.nonce, envelope.ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))
