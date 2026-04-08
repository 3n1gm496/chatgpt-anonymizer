from __future__ import annotations

import os
import secrets
from pathlib import Path

from local_engine.crypto.key_management import (
    derive_data_encryption_key,
    derive_legacy_data_encryption_key,
    derive_session_secret,
    generate_record_salt,
    load_or_create_installation_secret,
)
from local_engine.crypto.mapping_crypto import decrypt_payload, encrypt_payload, unpack_envelope
from local_engine.models.domain_models import SessionRecord
from local_engine.storage.temp_store import EnginePaths
from local_engine.utils.logging import get_logger

logger = get_logger(__name__)


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{secrets.token_hex(8)}.tmp")
    try:
        with temp_path.open("wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temp_path.chmod(0o600)
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


class EncryptedSessionStore:
    def __init__(self, data_dir: Path):
        self.paths = EnginePaths(data_dir.resolve())
        self.paths.ensure()
        self.installation_secret = load_or_create_installation_secret(self.paths.secret_file)

    def _build_data_encryption_key(self, session_id: str, blob: bytes) -> bytes:
        envelope = unpack_envelope(blob)
        if envelope.version == 1:
            return derive_legacy_data_encryption_key(self.installation_secret, session_id)

        session_secret = derive_session_secret(self.installation_secret, session_id)
        return derive_data_encryption_key(session_secret, envelope.record_salt)

    def save(self, session: SessionRecord) -> None:
        session_secret = derive_session_secret(self.installation_secret, session.session_id)
        record_salt = generate_record_salt()
        data_encryption_key = derive_data_encryption_key(session_secret, record_salt)
        payload = encrypt_payload(session.to_dict(), data_encryption_key, record_salt)
        path = self.paths.session_path(session.session_id)
        _atomic_write_bytes(path, payload)

    def load(self, session_id: str) -> SessionRecord | None:
        path = self.paths.session_path(session_id)
        if not path.exists():
            return None
        blob = path.read_bytes()
        data_encryption_key = self._build_data_encryption_key(session_id, blob)
        payload = decrypt_payload(blob, data_encryption_key)
        return SessionRecord.from_dict(payload)

    def delete(self, session_id: str) -> bool:
        path = self.paths.session_path(session_id)
        if not path.exists():
            return False
        path.unlink()
        return True

    def load_all(self) -> list[SessionRecord]:
        sessions: list[SessionRecord] = []
        for path in sorted(self.paths.sessions_dir.glob("*.bin")):
            session_id = path.stem
            try:
                session = self.load(session_id)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("Skipping unreadable encrypted session %s: %s", session_id, exc)
                continue
            if session is not None:
                sessions.append(session)
        return sessions

    def rotate_installation_secret(self) -> None:
        """
        Replace the installation secret with a freshly generated one.

        The old secret is overwritten atomically.  After this call, any
        on-disk session blobs that were encrypted with the old secret are
        unreadable until re-saved under the new secret.  Callers should
        load all sessions into memory before invoking this method and
        re-save them immediately after.

        Key rotation mitigates disk/backup compromise: an attacker who
        captures a backup after rotation cannot decrypt blobs written
        after the rotation even if they hold the pre-rotation secret.
        """
        new_secret = secrets.token_bytes(len(self.installation_secret))
        _atomic_write_bytes(self.paths.secret_file, new_secret)
        self.installation_secret = new_secret
        logger.info("installation_secret_rotated")
