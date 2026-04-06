from datetime import timedelta

from local_engine.core.session_manager import SessionManager
from local_engine.models.domain_models import utc_now
from local_engine.storage.encrypted_store import EncryptedSessionStore


def test_session_manager_persists_and_resets(tmp_path):
    store = EncryptedSessionStore(tmp_path)
    manager = SessionManager(store, default_ttl_minutes=45)

    session = manager.get_or_create("tab:11:chat:new")
    session.mapping["[EMAIL_001]"] = "user@example.com"
    manager.save(session)

    reloaded_manager = SessionManager(store, default_ttl_minutes=45)
    reloaded_session = reloaded_manager.get(session.session_id)

    assert reloaded_session is not None
    assert reloaded_session.mapping_count == 1

    reset = reloaded_manager.reset(session_id=session.session_id)

    assert reset[0] is True
    assert reloaded_manager.get(session.session_id) is None


def test_session_manager_ignores_session_id_from_other_scope(tmp_path):
    store = EncryptedSessionStore(tmp_path)
    manager = SessionManager(store, default_ttl_minutes=45)

    first = manager.get_or_create("tab:11:chat:new")
    second = manager.get_or_create("tab:12:chat:new", session_id=first.session_id)

    assert second.session_id != first.session_id
    assert second.conversation_id == "tab:12:chat:new"


def test_session_manager_creates_new_session_after_expiry(tmp_path):
    store = EncryptedSessionStore(tmp_path)
    manager = SessionManager(store, default_ttl_minutes=45)

    session = manager.get_or_create("tab:11:chat:new")
    session.expires_at = utc_now() - timedelta(seconds=1)
    manager.save(session)

    replacement = manager.get_or_create("tab:11:chat:new")

    assert replacement.session_id != session.session_id
