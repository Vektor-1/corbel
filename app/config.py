from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./corbel.db")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_bucket: str = os.getenv("MINIO_BUCKET", "corbel-private")
    researcher_api_key: str = os.getenv("RESEARCHER_API_KEY", "development-only-change-me")
    session_signing_secret: str = os.getenv("SESSION_SIGNING_SECRET", "development-only-change-me")
    upload_retention_days: int = int(os.getenv("UPLOAD_RETENTION_DAYS", "30"))
    session_max_hours: int = int(os.getenv("SESSION_MAX_HOURS", "8"))
    model_manifest_path: str = os.getenv("MODEL_MANIFEST_PATH", "/models/manifest.json")
    model_artifact_dir: str = os.getenv("MODEL_ARTIFACT_DIR", "/model-artifacts")
    # /v1/uploads and /v1/inference-jobs both trigger real cost (storage,
    # a GPU job) behind nothing but a valid participant token -- per-
    # session fixed-window limits, not a general API gateway.
    rate_limit_uploads_per_window: int = int(os.getenv("RATE_LIMIT_UPLOADS_PER_WINDOW", "10"))
    rate_limit_jobs_per_window: int = int(os.getenv("RATE_LIMIT_JOBS_PER_WINDOW", "5"))
    rate_limit_window_seconds: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))


settings = Settings()
