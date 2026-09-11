import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
from fastapi import Depends, Header, HTTPException, status
from .config import settings


def _encode(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(settings.session_signing_secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def issue_session_token(session_id: str, expires_at: datetime) -> str:
    return _encode({"sid": session_id, "exp": int(expires_at.timestamp())})


def decode_session_token(token: str) -> str:
    try:
        body, signature = token.split(".", 1)
        expected = hmac.new(settings.session_signing_secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload["exp"]) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        return str(payload["sid"])
    except (ValueError, KeyError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired participant token.")


def participant_session(authorization: str = Header(..., alias="Authorization")) -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Bearer participant token required.")
    return decode_session_token(token)


def researcher_access(key: str = Header(..., alias="X-Researcher-Key")) -> None:
    if not hmac.compare_digest(key, settings.researcher_api_key):
        raise HTTPException(status_code=401, detail="Invalid researcher key.")
