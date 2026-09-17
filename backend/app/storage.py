from datetime import timedelta
from hashlib import sha256
from io import BytesIO
from minio import Minio
from .config import settings


MAGIC_BYTES = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
    "application/pdf": (b"%PDF-",),
}


def client() -> Minio:
    return Minio(settings.minio_endpoint, access_key=settings.minio_access_key, secret_key=settings.minio_secret_key, secure=False)


def ensure_bucket() -> None:
    c = client()
    if not c.bucket_exists(settings.minio_bucket):
        c.make_bucket(settings.minio_bucket)


def presigned_put(object_key: str) -> str:
    return client().presigned_put_object(settings.minio_bucket, object_key, expires=timedelta(minutes=10))


def validate_object(object_key: str, content_type: str, expected_size: int, expected_hash: str) -> None:
    c = client()
    stat = c.stat_object(settings.minio_bucket, object_key)
    if stat.size != expected_size:
        raise ValueError("Uploaded object size does not match the request.")
    response = c.get_object(settings.minio_bucket, object_key)
    try:
        sample = response.read(32)
        if not any(sample.startswith(prefix) for prefix in MAGIC_BYTES[content_type]):
            raise ValueError("Uploaded file signature is invalid.")
        response.close()
        response.release_conn()
        stream = c.get_object(settings.minio_bucket, object_key)
        try:
            digest = sha256(stream.read()).hexdigest()
        finally:
            stream.close()
            stream.release_conn()
        if digest.lower() != expected_hash.lower():
            raise ValueError("Uploaded file hash does not match the request.")
    finally:
        try:
            response.close()
            response.release_conn()
        except Exception:
            pass


def delete_object(object_key: str) -> None:
    client().remove_object(settings.minio_bucket, object_key)
