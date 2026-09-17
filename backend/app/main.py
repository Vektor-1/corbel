from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import PurePosixPath
from redis import Redis
from rq import Queue
from fastapi import Depends, FastAPI, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .config import settings
from .database import Base, apply_additive_schema_migrations, engine, get_db
from .dimensions import DimensionConstraint, estimate_pixels_per_meter
from .manifests import active_manifest_id, load_registry, manifest_by_id, promote
from .models import Correction, InferenceJob, ModelAlias, StudySession, Upload
from .ratelimit import rate_limited_session
from .schemas import CorrectionCreate, DimensionConstraintsCreate, InferenceJobCreate, ManifestPromotion, StudySessionCreate, StudySessionResponse, UploadComplete, UploadCreate, UploadResponse
from .security import issue_session_token, participant_session, researcher_access
from .storage import delete_object, ensure_bucket, presigned_put, validate_object
from .tasks import execute_inference

app = FastAPI(title="Corbel ML Backend", version="1.0.0")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    apply_additive_schema_migrations()
    ensure_bucket()
    # The registry is immutable on disk. The mutable production alias lives in
    # PostgreSQL so promotion works in a read-only container and is auditable.
    db = next(get_db())
    try:
        if not db.get(ModelAlias, "production"):
            db.add(ModelAlias(name="production", manifest_id=str(load_registry()["activeAlias"])))
            db.commit()
    finally:
        db.close()


def owned_session(db: Session, session_id: str) -> StudySession:
    item = db.get(StudySession, session_id)
    # expires_at/revoked_at come back timezone-aware (DateTime(timezone=True)
    # columns, app/models.py) even though they're written from naive
    # datetime.utcnow() calls elsewhere -- now must stay aware too, or this
    # comparison raises "can't compare offset-naive and offset-aware
    # datetimes" on every request (confirmed live, 2026-09-10).
    now = datetime.now(timezone.utc)
    if not item or item.revoked_at or item.expires_at <= now:
        raise HTTPException(status_code=401, detail="Study session is unavailable.")
    return item


def owned_upload(db: Session, upload_id: str, session_id: str) -> Upload:
    item = db.get(Upload, upload_id)
    if not item or item.session_id != session_id:
        raise HTTPException(status_code=404, detail="Upload not found.")
    return item


def owned_job(db: Session, job_id: str, session_id: str) -> InferenceJob:
    item = db.get(InferenceJob, job_id)
    if not item or item.session_id != session_id:
        raise HTTPException(status_code=404, detail="Inference job not found.")
    return item


@app.get("/healthz")
def healthz():
    registry = load_registry()
    return {"ok": True, "activeManifest": registry.get("activeAlias")}


@app.post("/v1/study-sessions", response_model=StudySessionResponse, dependencies=[Depends(researcher_access)])
def create_study_session(payload: StudySessionCreate, db: Session = Depends(get_db)):
    hours = payload.expiresInHours or settings.session_max_hours
    expires_at = datetime.utcnow() + timedelta(hours=hours)
    item = StudySession(participant_ref=sha256(payload.participantRef.encode()).hexdigest(), expires_at=expires_at)
    db.add(item); db.commit(); db.refresh(item)
    return StudySessionResponse(id=item.id, expiresAt=item.expires_at, participantToken=issue_session_token(item.id, item.expires_at.replace(tzinfo=timezone.utc)))


@app.post("/v1/uploads", response_model=UploadResponse)
def create_upload(payload: UploadCreate, session_id: str = Depends(rate_limited_session("uploads", settings.rate_limit_uploads_per_window)), db: Session = Depends(get_db)):
    owned_session(db, session_id)
    safe_name = PurePosixPath(payload.fileName).name
    if safe_name != payload.fileName or safe_name.startswith("."):
        raise HTTPException(status_code=400, detail="Unsafe upload filename.")
    expires_at = datetime.utcnow() + timedelta(days=settings.upload_retention_days)
    item = Upload(session_id=session_id, object_key="pending", file_name=safe_name, content_type=payload.contentType, size_bytes=payload.sizeBytes, expires_at=expires_at)
    db.add(item); db.flush()
    item.object_key = f"private/{session_id}/{item.id}/{safe_name}"
    db.commit(); db.refresh(item)
    return UploadResponse(id=item.id, uploadUrl=presigned_put(item.object_key), expiresAt=item.expires_at)


@app.post("/v1/uploads/{upload_id}/complete", status_code=204)
def complete_upload(upload_id: str, payload: UploadComplete, session_id: str = Depends(participant_session), db: Session = Depends(get_db)):
    item = owned_upload(db, upload_id, session_id)
    if item.status != "pending":
        raise HTTPException(status_code=409, detail="Upload is already finalized.")
    try:
        validate_object(item.object_key, item.content_type, item.size_bytes, payload.sha256)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    item.sha256, item.status = payload.sha256.lower(), "ready"; db.commit()
    return Response(status_code=204)


@app.post("/v1/inference-jobs", status_code=202)
def create_job(payload: InferenceJobCreate, session_id: str = Depends(rate_limited_session("jobs", settings.rate_limit_jobs_per_window)), db: Session = Depends(get_db)):
    owned_session(db, session_id)
    upload = owned_upload(db, payload.uploadId, session_id)
    if upload.status != "ready":
        raise HTTPException(status_code=409, detail="Upload is not ready for inference.")
    manifest_id = payload.manifestId or active_manifest_id(db)
    manifest_by_id(manifest_id)
    job = InferenceJob(session_id=session_id, upload_id=upload.id, manifest_id=manifest_id, debug_requested=payload.debug)
    db.add(job); db.commit(); db.refresh(job)
    Queue("inference", connection=Redis.from_url(settings.redis_url)).enqueue(execute_inference, job.id, job_timeout=900)
    return {"id": job.id, "status": job.status, "manifestId": job.manifest_id}


@app.get("/v1/inference-jobs/{job_id}")
def get_job(job_id: str, session_id: str = Depends(participant_session), db: Session = Depends(get_db)):
    job = owned_job(db, job_id, session_id)
    return {"id": job.id, "status": job.status, "progress": job.progress, "manifestId": job.manifest_id, "result": job.result, "error": job.error, "timings": job.timings}


@app.post("/v1/inference-jobs/{job_id}/cancel")
def cancel_job(job_id: str, session_id: str = Depends(participant_session), db: Session = Depends(get_db)):
    job = owned_job(db, job_id, session_id)
    if job.status in {"review", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Job is already terminal.")
    job.status = "cancelled"; db.commit()
    return {"id": job.id, "status": job.status}


@app.post("/v1/inference-jobs/{job_id}/dimension-constraints")
def estimate_dimension_constraints(job_id: str, payload: DimensionConstraintsCreate, session_id: str = Depends(participant_session), db: Session = Depends(get_db)):
    job = owned_job(db, job_id, session_id)
    if job.status != "review":
        raise HTTPException(status_code=409, detail="Dimension constraints require a reviewable job.")
    result = estimate_pixels_per_meter([
        DimensionConstraint(item.id, (item.start.x, item.start.y), (item.end.x, item.end.y), item.valueMm, item.confidence)
        for item in payload.constraints
    ], payload.maximumRelativeResidual)
    return {"mode": "shadow", "geometryChanged": False, **result}


@app.post("/v1/inference-jobs/{job_id}/corrections", status_code=201)
def create_correction(job_id: str, payload: CorrectionCreate, session_id: str = Depends(participant_session), db: Session = Depends(get_db)):
    job = owned_job(db, job_id, session_id)
    if job.status != "review":
        raise HTTPException(status_code=409, detail="Only reviewable jobs can be corrected.")
    material_edit = bool(payload.editDeltas) or payload.errorReason is not None
    if payload.acceptedUnchanged and material_edit:
        raise HTTPException(status_code=400, detail="An accepted-unchanged correction cannot include edits or an error reason.")
    review_status = "pending" if payload.trainingConsent and (material_edit or payload.acceptedUnchanged) else "ineligible"
    result = job.result or {}
    item = Correction(
        job_id=job.id,
        proposed_geometry=result.get("geometry"),
        quality_features=result.get("quality"),
        approved_geometry=payload.approvedGeometry,
        edit_deltas=payload.editDeltas,
        error_reason=payload.errorReason,
        training_consent=payload.trainingConsent,
        review_status=review_status,
    )
    db.add(item); db.commit(); db.refresh(item)
    return {"id": item.id, "trainingEligible": review_status == "pending"}


@app.get("/v1/research/training-candidates", dependencies=[Depends(researcher_access)])
def training_candidates(db: Session = Depends(get_db)):
    return [{"id": c.id, "jobId": c.job_id, "status": c.review_status, "hasProposalSnapshot": c.proposed_geometry is not None, "hasQualityFeatures": c.quality_features is not None, "createdAt": c.created_at} for c in db.scalars(select(Correction).where(Correction.review_status == "pending")).all()]


@app.post("/v1/research/training-candidates/{correction_id}/{decision}", dependencies=[Depends(researcher_access)])
def review_candidate(correction_id: str, decision: str, db: Session = Depends(get_db)):
    if decision not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="Decision must be approve or reject.")
    item = db.get(Correction, correction_id)
    if not item or item.review_status != "pending":
        raise HTTPException(status_code=404, detail="Pending training candidate not found.")
    item.review_status = "approved" if decision == "approve" else "rejected"; db.commit()
    return {"id": item.id, "status": item.review_status}


@app.get("/v1/research/model-manifests", dependencies=[Depends(researcher_access)])
def list_manifests():
    return load_registry()


@app.post("/v1/research/model-manifests/promote", dependencies=[Depends(researcher_access)])
def promote_manifest(payload: ManifestPromotion, db: Session = Depends(get_db)):
    promote(db, payload.manifestId)
    return {"activeManifest": payload.manifestId}


@app.get("/v1/research/model-metrics", dependencies=[Depends(researcher_access)])
def model_metrics(db: Session = Depends(get_db)):
    rows = db.execute(
        select(InferenceJob.manifest_id, InferenceJob.status, func.count(InferenceJob.id))
        .group_by(InferenceJob.manifest_id, InferenceJob.status)
    ).all()
    metrics: dict[str, dict[str, int]] = {}
    for manifest_id, job_status, count in rows:
        metrics.setdefault(manifest_id, {})[job_status] = count
    return {"byManifest": metrics, "note": "Offline frozen-set quality metrics are registered outside production jobs."}


@app.post("/v1/research/retention/run", dependencies=[Depends(researcher_access)])
def run_retention(db: Session = Depends(get_db)):
    # Same naive-vs-aware pattern as owned_session() above, fixed for
    # consistency with the aware DateTime(timezone=True) columns.
    now = datetime.now(timezone.utc)
    expired = db.scalars(select(Upload).where(Upload.expires_at <= now, Upload.status.in_(["pending", "ready"]))).all()
    removed = 0
    for upload in expired:
        try:
            delete_object(upload.object_key)
        except Exception:
            # Object removal is idempotent: it may already have been deleted.
            pass
        upload.status = "expired"
        removed += 1
    db.commit()
    return {"expiredUploads": removed}
