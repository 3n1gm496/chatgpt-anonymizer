from __future__ import annotations

import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

INSTALLATION_SECRET_BYTES = 32
SESSION_SECRET_BYTES = 32
DATA_ENCRYPTION_KEY_BYTES = 32
RECORD_SALT_BYTES = 16

_SESSION_SECRET_INFO = b"chatgpt-anonymizer:session-secret:v1"
_DATA_ENCRYPTION_KEY_INFO = b"chatgpt-anonymizer:data-encryption-key:v2"
_LEGACY_DATA_ENCRYPTION_KEY_INFO = b"chatgpt-anonymizer:mapping:v1"


def _atomic_write_secret(secret_file: Path, payload: bytes) -> None:
    temp_path = secret_file.with_name(f".{secret_file.name}.{secrets.token_hex(8)}.tmp")
    try:
        with temp_path.open("wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temp_path.chmod(0o600)
        os.replace(temp_path, secret_file)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


def load_or_create_installation_secret(secret_file: Path) -> bytes:
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    if secret_file.exists():
        secret = secret_file.read_bytes()
        if len(secret) != INSTALLATION_SECRET_BYTES:
            raise ValueError("Installation secret has an invalid length.")
        return secret

    secret = secrets.token_bytes(INSTALLATION_SECRET_BYTES)
    _atomic_write_secret(secret_file, secret)
    return secret


def derive_session_secret(installation_secret: bytes, session_id: str) -> bytes:
    """
    Derive an in-memory session secret from the installation secret.

    The installation secret is the only long-lived root secret on disk.
    The session secret is deterministic per session id and is never persisted
    separately. It acts as the parent key for record-level data encryption keys.
    """

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=SESSION_SECRET_BYTES,
        salt=session_id.encode("utf-8"),
        info=_SESSION_SECRET_INFO,
    )
    return hkdf.derive(installation_secret)


def generate_record_salt() -> bytes:
    return secrets.token_bytes(RECORD_SALT_BYTES)


def derive_data_encryption_key(session_secret: bytes, record_salt: bytes) -> bytes:
    """
    Derive a record-scoped DEK from the session secret plus a per-record salt.
    """

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=DATA_ENCRYPTION_KEY_BYTES,
        salt=record_salt,
        info=_DATA_ENCRYPTION_KEY_INFO,
    )
    return hkdf.derive(session_secret)


def derive_legacy_data_encryption_key(installation_secret: bytes, session_id: str) -> bytes:
    """
    Backward-compatibility path for blobs written before the explicit
    installation-secret -> session-secret -> DEK split.
    """

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=DATA_ENCRYPTION_KEY_BYTES,
        salt=session_id.encode("utf-8"),
        info=_LEGACY_DATA_ENCRYPTION_KEY_INFO,
    )
    return hkdf.derive(installation_secret)
