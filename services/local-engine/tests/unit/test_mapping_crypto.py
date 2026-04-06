import pytest
from cryptography.exceptions import InvalidTag

from local_engine.crypto.key_management import (
    derive_data_encryption_key,
    derive_session_secret,
    generate_record_salt,
    load_or_create_installation_secret,
)
from local_engine.crypto.mapping_crypto import decrypt_payload, encrypt_payload, unpack_envelope


def test_encrypt_roundtrip_with_explicit_key_model(tmp_path):
    installation_secret = load_or_create_installation_secret(tmp_path / "installation.secret")
    session_secret = derive_session_secret(installation_secret, "session-1")
    record_salt = generate_record_salt()
    data_encryption_key = derive_data_encryption_key(session_secret, record_salt)
    payload = {"mapping": {"[EMAIL_001]": "user@example.com"}}

    encrypted = encrypt_payload(payload, data_encryption_key, record_salt)
    envelope = unpack_envelope(encrypted)

    assert encrypted.startswith(b"CGA2")
    assert envelope.version == 2
    assert decrypt_payload(encrypted, data_encryption_key) == payload


def test_decrypt_fails_with_wrong_session_secret(tmp_path):
    installation_secret = load_or_create_installation_secret(tmp_path / "installation.secret")
    correct_session_secret = derive_session_secret(installation_secret, "session-1")
    wrong_session_secret = derive_session_secret(installation_secret, "session-2")
    record_salt = generate_record_salt()

    encrypted = encrypt_payload(
        {"mapping": {"[EMAIL_001]": "user@example.com"}},
        derive_data_encryption_key(correct_session_secret, record_salt),
        record_salt,
    )

    with pytest.raises(InvalidTag):
        decrypt_payload(
            encrypted,
            derive_data_encryption_key(wrong_session_secret, record_salt),
        )
