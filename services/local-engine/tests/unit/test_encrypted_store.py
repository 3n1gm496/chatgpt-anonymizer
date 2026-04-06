import secrets

import pytest
from cryptography.exceptions import InvalidTag

from local_engine.models.domain_models import SessionRecord
from local_engine.storage.encrypted_store import EncryptedSessionStore


def test_encrypted_store_persists_session_roundtrip(tmp_path):
    store = EncryptedSessionStore(tmp_path)
    session = SessionRecord.new("tab:11:chat:new", ttl_minutes=45)
    session.mapping["[EMAIL_001]"] = "user@example.com"
    session.reverse_lookup["EMAIL:user@example.com"] = "[EMAIL_001]"
    store.save(session)

    reloaded_store = EncryptedSessionStore(tmp_path)
    loaded = reloaded_store.load(session.session_id)

    assert loaded is not None
    assert loaded.mapping["[EMAIL_001]"] == "user@example.com"


def test_encrypted_store_fails_with_wrong_installation_secret(tmp_path):
    store = EncryptedSessionStore(tmp_path)
    session = SessionRecord.new("tab:11:chat:new", ttl_minutes=45)
    session.mapping["[EMAIL_001]"] = "user@example.com"
    store.save(session)

    store.paths.secret_file.write_bytes(secrets.token_bytes(32))

    with pytest.raises(InvalidTag):
        EncryptedSessionStore(tmp_path).load(session.session_id)
