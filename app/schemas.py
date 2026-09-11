from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


class StudySessionCreate(BaseModel):
    participantRef: str = Field(min_length=1, max_length=160)
    expiresInHours: int | None = Field(default=None, ge=1, le=72)


class StudySessionResponse(BaseModel):
    id: str
    expiresAt: datetime
    participantToken: str


class UploadCreate(BaseModel):
    fileName: str = Field(min_length=1, max_length=180)
    contentType: Literal["image/png", "image/jpeg", "image/webp", "application/pdf"]
    sizeBytes: int = Field(gt=0, le=25 * 1024 * 1024)


class UploadResponse(BaseModel):
    id: str
    uploadUrl: str
    expiresAt: datetime


class UploadComplete(BaseModel):
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")


class InferenceJobCreate(BaseModel):
    uploadId: str
    manifestId: str | None = None
    debug: bool = False


class CorrectionCreate(BaseModel):
    approvedGeometry: dict[str, Any]
    editDeltas: list[dict[str, Any]]
    errorReason: str | None = Field(default=None, max_length=500)
    trainingConsent: bool = False
    acceptedUnchanged: bool = False


class DimensionPoint(BaseModel):
    x: float
    y: float


class DimensionConstraintCreate(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    start: DimensionPoint
    end: DimensionPoint
    valueMm: float = Field(gt=0, le=1_000_000)
    confidence: float = Field(ge=0, le=1)


class DimensionConstraintsCreate(BaseModel):
    constraints: list[DimensionConstraintCreate] = Field(min_length=1, max_length=100)
    maximumRelativeResidual: float = Field(default=0.08, gt=0, le=0.5)


class ManifestPromotion(BaseModel):
    manifestId: str
