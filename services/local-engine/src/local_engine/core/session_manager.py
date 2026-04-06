from __future__ import annotations

from threading import RLock

from local_engine.models.domain_models import SessionRecord
from local_engine.storage.encrypted_store import EncryptedSessionStore


class SessionManager:
    """
    Single-process session registry with encrypted persistence.

    Invariants:
    - one active session id maps to exactly one conversation scope id
    - one conversation scope id maps to at most one active session id
    - expired sessions are removed from both memory and disk before reuse
    """

    def __init__(self, store: EncryptedSessionStore, default_ttl_minutes: int):
        self.store = store
        self.default_ttl_minutes = default_ttl_minutes
        self._sessions: dict[str, SessionRecord] = {}
        self._conversation_index: dict[str, str] = {}
        self._lock = RLock()
        self._load_existing()

    def _drop_session(self, session: SessionRecord) -> None:
        self._sessions.pop(session.session_id, None)
        self._conversation_index.pop(session.conversation_id, None)

    def _remember_session(self, session: SessionRecord) -> None:
        self._sessions[session.session_id] = session
        self._conversation_index[session.conversation_id] = session.session_id

    def _load_existing(self) -> None:
        with self._lock:
            for session in self.store.load_all():
                if session.is_expired:
                    self.store.delete(session.session_id)
                    continue
                self._remember_session(session)

    def expire_stale_sessions(self) -> None:
        with self._lock:
            for session_id, session in list(self._sessions.items()):
                if session.is_expired:
                    self._drop_session(session)
                    self.store.delete(session_id)

    def save(self, session: SessionRecord) -> None:
        with self._lock:
            self._remember_session(session)
            self.store.save(session)

    def get(self, session_id: str) -> SessionRecord | None:
        self.expire_stale_sessions()
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None:
                return session

        loaded = self.store.load(session_id)
        if loaded is None:
            return None

        if loaded.is_expired:
            self.store.delete(session_id)
            return None

        self.save(loaded)
        return loaded

    def get_or_create(
        self,
        conversation_id: str,
        session_id: str | None = None,
        ttl_minutes: int | None = None,
    ) -> SessionRecord:
        self.expire_stale_sessions()
        ttl = ttl_minutes or self.default_ttl_minutes
        requested_session_id = session_id

        if requested_session_id:
            existing = self.get(requested_session_id)
            if existing is not None and existing.conversation_id == conversation_id:
                existing.touch(ttl)
                self.save(existing)
                return existing
            # A caller-provided session id is only reusable inside the same
            # conversation scope. Reusing it across scopes would merge mappings
            # from duplicated tabs or unrelated conversations.
            if existing is not None and existing.conversation_id != conversation_id:
                requested_session_id = None

        with self._lock:
            indexed_id = self._conversation_index.get(conversation_id)

        if indexed_id:
            existing = self.get(indexed_id)
            if existing is not None:
                existing.touch(ttl)
                self.save(existing)
                return existing

        session = SessionRecord.new(
            conversation_id=conversation_id,
            ttl_minutes=ttl,
            session_id=requested_session_id,
        )
        self.save(session)
        return session

    def reset(
        self,
        session_id: str | None = None,
        conversation_id: str | None = None,
    ) -> tuple[bool, str | None, str | None, int]:
        self.expire_stale_sessions()
        target: SessionRecord | None = None
        if session_id:
            target = self.get(session_id)
        elif conversation_id:
            with self._lock:
                indexed_id = self._conversation_index.get(conversation_id)
            if indexed_id:
                target = self.get(indexed_id)

        if target is None:
            return False, session_id, conversation_id, 0

        with self._lock:
            cleared = target.mapping_count
            self._drop_session(target)
            self.store.delete(target.session_id)
            return True, target.session_id, target.conversation_id, cleared
