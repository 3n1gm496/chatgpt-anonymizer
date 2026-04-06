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
    bind: Literal["127.0.0.1"]
    mlEnabled: bool
    detectors: list[str]
    storage: StorageInfoModel
    uptimeSeconds: float


class SanitizeOptionsModel(StrictModel):
    enableMl: bool = False
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
