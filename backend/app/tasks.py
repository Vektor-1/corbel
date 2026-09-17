from datetime import datetime
from pathlib import Path
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import InferenceJob, Upload
from .storage import client
from .config import settings
from .inference import run_ensemble


def execute_inference(job_id: str) -> None:
    db: Session = SessionLocal()
    local_path: Path | None = None
    try:
        job = db.get(InferenceJob, job_id)
        if not job or job.status == "cancelled":
            return
        upload = db.get(Upload, job.upload_id)
        if not upload or upload.status != "ready":
            raise RuntimeError("Referenced upload is unavailable.")
        job.status, job.progress = "processing", 10; db.commit()
        local_path = Path("/tmp") / f"{job.id}-{upload.file_name}"
        response = client().get_object(settings.minio_bucket, upload.object_key)
        try:
            local_path.write_bytes(response.read())
        finally:
            response.close(); response.release_conn()
        source = {"kind": "pdf" if upload.content_type == "application/pdf" else "image", "fileName": upload.file_name, "width": 1, "height": 1}
        result = run_ensemble(local_path, source, job.manifest_id)
        if job.status == "cancelled":
            return
        job.status, job.progress, job.result = "review", 100, result
        job.timings = result.get("timings")
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.get(InferenceJob, job_id)
        if job:
            job.status, job.progress, job.error = "failed", 100, str(exc)
            db.commit()
    finally:
        # The downloaded copy is a processing scratch file, not the durable
        # artifact (MinIO/object_key is) -- every job used to leak one of
        # these into /tmp forever. Remove it regardless of success/failure.
        if local_path is not None:
            local_path.unlink(missing_ok=True)
        db.close()
