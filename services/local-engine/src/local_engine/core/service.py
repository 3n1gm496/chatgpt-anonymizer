from __future__ import annotations

from time import monotonic

from local_engine import __version__
from local_engine.core.policies import EngineSettings
from local_engine.core.risk_scoring import build_risk_summary
from local_engine.core.session_manager import SessionManager
from local_engine.detectors.registry import detect_text, registered_detector_names
from local_engine.models.api_models import (
    FindingModel,
    HealthResponseModel,
    RehydrationMatchModel,
    ReplacementModel,
    ResetSessionRequestModel,
    ResetSessionResponseModel,
    RevertRequestModel,
    RevertResponseModel,
    SanitizeRequestModel,
    SanitizeResponseModel,
    SessionSummaryModel,
    StorageInfoModel,
)
from local_engine.models.enums import ConfidenceLevel
from local_engine.pseudonymizer.engine import PseudonymizerEngine
from local_engine.pseudonymizer.replacement_planner import (
    apply_replacements,
    build_replacement_plan,
    revert_known_placeholders,
)
from local_engine.storage.encrypted_store import EncryptedSessionStore
from local_engine.storage.process_lock import EngineProcessLock
from local_engine.utils.text_normalization import normalize_input_text, stable_fingerprint


def _confidence_level(score: float) -> str:
    if score >= 0.9:
        return ConfidenceLevel.HIGH.value
    if score >= 0.75:
        return ConfidenceLevel.MEDIUM.value
    return ConfidenceLevel.LOW.value


class LocalAnonymizationService:
    def __init__(
        self,
        settings: EngineSettings,
        *,
        acquire_process_lock: bool = False,
    ):
        self.settings = settings
        self.process_lock = (
            EngineProcessLock.acquire(settings.data_dir) if acquire_process_lock else None
        )
        self.store = EncryptedSessionStore(settings.data_dir)
        self.sessions = SessionManager(self.store, default_ttl_minutes=settings.session_ttl_minutes)
        self.pseudonymizer = PseudonymizerEngine()
        self.started_monotonic = monotonic()

    def close(self) -> None:
        if self.process_lock is not None:
            self.process_lock.release()
            self.process_lock = None

    def health(self) -> HealthResponseModel:
        return HealthResponseModel(
            status="ok",
            engineVersion=__version__,
            bind="127.0.0.1",
            mlEnabled=self.settings.ml_enabled,
            detectors=registered_detector_names(self.settings),
            storage=StorageInfoModel(
                encrypted=True,
                dataDir=str(self.settings.data_dir.resolve()),
            ),
            uptimeSeconds=round(monotonic() - self.started_monotonic, 3),
        )

    def sanitize(self, payload: SanitizeRequestModel) -> SanitizeResponseModel:
        normalized_text = normalize_input_text(payload.text)
        if len(normalized_text) > self.settings.max_text_chars:
            raise ValueError("Input text exceeds the configured safety limit.")

        session = self.sessions.get_or_create(
            conversation_id=payload.conversationId,
            session_id=payload.sessionId,
            ttl_minutes=payload.options.sessionTtlMinutes,
        )
        findings = detect_text(
            normalized_text,
            settings=self.settings,
            enable_ml=payload.options.enableMl,
        )
        replacements = build_replacement_plan(
            findings=findings,
            session=session,
            pseudonymizer=self.pseudonymizer,
            exclusions=set(payload.exclusions),
        )
        sanitized_text = apply_replacements(normalized_text, replacements)
        risk_summary = build_risk_summary(
            findings=findings,
            replacements=replacements,
            review_threshold=self.settings.review_threshold,
        )

        session.touch(payload.options.sessionTtlMinutes or self.settings.session_ttl_minutes)
        session.replacement_count += sum(1 for replacement in replacements if replacement.applied)
        session.low_confidence_count = risk_summary.lowConfidenceCount
        session.review_pending = False
        self.sessions.save(session)

        return SanitizeResponseModel(
            sessionId=session.session_id,
            sanitizedText=sanitized_text,
            sanitizedFingerprint=stable_fingerprint(sanitized_text),
            expiresAt=session.expires_at,
            findings=[
                FindingModel(
                    id=finding.id,
                    entityType=finding.entity_type.value,
                    detector=finding.detector,
                    confidence=finding.confidence,
                    confidenceLevel=_confidence_level(finding.confidence),
                    start=finding.start,
                    end=finding.end,
                    originalText=finding.original_text,
                    placeholder=self.pseudonymizer.get_or_create_placeholder(session, finding),
                    reviewRecommended=finding.review_recommended,
                    rationale=finding.rationale,
                )
                for finding in findings
            ],
            replacements=[
                ReplacementModel(
                    findingId=replacement.finding_id,
                    entityType=replacement.entity_type.value,
                    start=replacement.start,
                    end=replacement.end,
                    originalText=replacement.original_text,
                    placeholder=replacement.placeholder,
                    confidence=replacement.confidence,
                    applied=replacement.applied,
                )
                for replacement in replacements
            ],
            riskSummary=risk_summary,
        )

    def revert(self, payload: RevertRequestModel) -> RevertResponseModel:
        session = self.sessions.get(payload.sessionId)
        if session is None:
            raise KeyError(f"Unknown session: {payload.sessionId}")

        reverted_text, matches = revert_known_placeholders(payload.text, session.mapping)
        return RevertResponseModel(
            sessionId=session.session_id,
            revertedText=reverted_text,
            totalReplacements=sum(int(match["count"]) for match in matches),
            replacements=[RehydrationMatchModel(**match) for match in matches],
        )

    def get_session_summary(self, session_id: str) -> SessionSummaryModel:
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"Unknown session: {session_id}")
        return SessionSummaryModel(
            sessionId=session.session_id,
            conversationId=session.conversation_id,
            createdAt=session.created_at,
            updatedAt=session.updated_at,
            expiresAt=session.expires_at,
            mappingCount=session.mapping_count,
            replacementCount=session.replacement_count,
            lowConfidenceCount=session.low_confidence_count,
            reviewPending=session.review_pending,
        )

    def reset_session(self, payload: ResetSessionRequestModel) -> ResetSessionResponseModel:
        reset, session_id, conversation_id, cleared = self.sessions.reset(
            session_id=payload.sessionId,
            conversation_id=payload.conversationId,
        )
        return ResetSessionResponseModel(
            reset=reset,
            sessionId=session_id,
            conversationId=conversation_id,
            clearedMappings=cleared,
        )
