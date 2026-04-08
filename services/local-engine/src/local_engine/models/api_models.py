"""
API models for the local pseudonymisation engine.

All public field names are camelCase for JSON serialisation consistency.
Obsolete ``ml``-prefixed fields are replaced with ``heuristics``-prefixed
equivalents to be technically accurate about the detection mechanism.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProtocolModel(StrictModel):
    protocolVersion: Literal["v1"] = "v1"


class StorageInfoModel(StrictModel):
    encrypted: bool
    dataDir: str


class HealthResponseModel(ProtocolModel):
    status: Literal["ok", "degraded"]
    engineVersion: str
    protocolVersion: Literal["v1"] = "v1"
    bind: Literal["127.0.0.1"]
    # heuristicsEnabled replaces the previous mlEnabled (which was inaccurate:
    # contextual heuristic rules are regex-based, not machine learning).
    heuristicsEnabled: bool
    detectors: list[str]
    storage: StorageInfoModel
    uptimeSeconds: float


class SanitizeOptionsModel(StrictModel):
    # Renamed from enableMl to enableHeuristics — contextual heuristic rules,
    # not ML.  The old name is accepted for one release cycle for compatibility.
    enableHeuristics: bool = True
    sessionTtlMinutes: int | None = Field(default=None, ge=1, le=1440)


class SanitizeRequestModel(ProtocolModel):
    conversationId: str = Field(min_length=1)
    sessionId: str | None = Field(default=None, min_length=1)
    text: str = Field(min_length=1, max_length=50000)
    detectedContentType: Literal["paste", "drop", "manual"] = "paste"
    exclusions: list[str] = Field(default_factory=list)
    options: SanitizeOptionsModel = Field(default_factory=SanitizeOptionsModel)


class FindingModel(StrictModel):
    id: str
    entityType: str
    detector: str
    confidence: float = Field(ge=0, le=1)
    confidenceLevel: Literal["high", "medium", "low"]
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    originalText: str
    placeholder: str
    reviewRecommended: bool
    rationale: str | None = None


class ReplacementModel(StrictModel):
    findingId: str
    entityType: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    originalText: str
    placeholder: str
    confidence: float = Field(ge=0, le=1)
    applied: bool


class RiskSummaryModel(StrictModel):
    score: float = Field(ge=0, le=100)
    level: Literal["low", "medium", "high"]
    findingsCount: int = Field(ge=0)
    replacementCount: int = Field(ge=0)
    lowConfidenceCount: int = Field(ge=0)
    ambiguousCount: int = Field(ge=0)
    reviewRequired: bool
    entityCounts: dict[str, int]


class SanitizeResponseModel(ProtocolModel):
    sessionId: str
    sanitizedText: str
    sanitizedFingerprint: str = Field(min_length=64, max_length=64)
    expiresAt: datetime
    findings: list[FindingModel]
    replacements: list[ReplacementModel]
    riskSummary: RiskSummaryModel


class RevertRequestModel(ProtocolModel):
    sessionId: str = Field(min_length=1)
    text: str


class RehydrationMatchModel(StrictModel):
    placeholder: str
    originalText: str
    count: int = Field(ge=0)


class RevertResponseModel(ProtocolModel):
    sessionId: str
    revertedText: str
    totalReplacements: int = Field(ge=0)
    replacements: list[RehydrationMatchModel]


class SessionSummaryModel(ProtocolModel):
    sessionId: str
    conversationId: str
    createdAt: datetime
    updatedAt: datetime
    expiresAt: datetime
    mappingCount: int = Field(ge=0)
    replacementCount: int = Field(ge=0)
    lowConfidenceCount: int = Field(ge=0)
    reviewPending: bool


class ResetSessionRequestModel(ProtocolModel):
    sessionId: str | None = None
    conversationId: str | None = None

    @model_validator(mode="after")
    def validate_identifier(self) -> ResetSessionRequestModel:
        if not self.sessionId and not self.conversationId:
            raise ValueError("Either sessionId or conversationId must be provided.")
        return self


class ResetSessionResponseModel(ProtocolModel):
    reset: bool
    sessionId: str | None
    conversationId: str | None
    clearedMappings: int = Field(ge=0)


# ---------------------------------------------------------------------------
# Engine auth token — used by extension to prove it is a trusted caller
# ---------------------------------------------------------------------------

class EngineTokenResponseModel(StrictModel):
    """
    Response from the /engine-token endpoint.

    The token is a per-startup random secret that the extension must include
    as the ``X-Cga-Token`` header on all mutation endpoints.  It provides
    anti-confused-deputy protection: any other local process can connect to
    127.0.0.1, but without the token its requests will be rejected.
    """

    token: str


# ---------------------------------------------------------------------------
# Key rotation
# ---------------------------------------------------------------------------

class RotateKeyResponseModel(StrictModel):
    """Response from the /admin/rotate-key endpoint."""

    rotated: bool
    sessionsReencrypted: int
    message: str
