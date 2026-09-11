"""Per-session fixed-window rate limiting for the two cost-triggering
routes (/v1/uploads, /v1/inference-jobs) -- each spends real storage or
GPU time behind nothing but a valid participant token today. Redis is
already a deployed dependency (the job queue transport); this is a
counter on it, not a new subsystem.
"""
from fastapi import Depends, HTTPException
from redis import Redis
from .config import settings
from .security import participant_session

_redis: Redis | None = None


def _get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url)
    return _redis


def rate_limited_session(key_prefix: str, max_requests: int):
    """Returns a FastAPI dependency: validates the participant token (via
    participant_session) and enforces max_requests per
    settings.rate_limit_window_seconds for that session, keyed by
    key_prefix. Raises 429 over the limit; otherwise returns session_id,
    a drop-in replacement for a bare Depends(participant_session)."""

    def _check(session_id: str = Depends(participant_session)) -> str:
        window = settings.rate_limit_window_seconds
        key = f"ratelimit:{key_prefix}:{session_id}"
        count = _get_redis().incr(key)
        if count == 1:
            _get_redis().expire(key, window)
        if count > max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: max {max_requests} {key_prefix} per {window}s.",
            )
        return session_id

    return _check
