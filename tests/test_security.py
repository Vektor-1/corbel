from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException
from app.security import decode_session_token, issue_session_token


def test_session_token_round_trip():
    token = issue_session_token("session-1", datetime.now(timezone.utc) + timedelta(minutes=1))
    assert decode_session_token(token) == "session-1"


def test_expired_session_token_is_rejected():
    token = issue_session_token("session-1", datetime.now(timezone.utc) - timedelta(minutes=1))
    with pytest.raises(HTTPException) as error:
        decode_session_token(token)
    assert error.value.status_code == 401
