import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .activity import touch
from .config import get_settings
from .db import get_db
from .models import User

_bearer = HTTPBearer(auto_error=False)
_RESET = "password-reset"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def password_fingerprint(user: User) -> str:
    """Changes whenever the password changes. Tokens carrying an old fingerprint stop working."""
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


def create_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "bid": user.business_id,
        "pv": password_fingerprint(user),
        "iat": now,
        "exp": now + timedelta(hours=s.jwt_expiry_hours),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue")
    try:
        payload = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Sign in again.")
    if payload.get("purpose"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue")
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    # Sessions started before a password change are signed out. (Older tokens have no "pv".)
    if "pv" in payload and payload["pv"] != password_fingerprint(user):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your password was changed. Sign in again.")
    if user.business.status == "suspended" and not is_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, SUSPENDED_MESSAGE)
    touch(db, user.business_id)
    return user


SUSPENDED_MESSAGE = "This account is paused. Contact us to switch it back on."


def is_admin(user: User) -> bool:
    return user.email.lower() in get_settings().admin_email_set


def require_admin(user: User = Depends(current_user)) -> User:
    if not is_admin(user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return user


def create_reset_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "purpose": _RESET,
        "pv": password_fingerprint(user),
        "iat": now,
        "exp": now + timedelta(minutes=s.password_reset_minutes),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def user_from_reset_token(db: Session, token: str) -> User:
    """Valid once: after the password changes, the fingerprint no longer matches."""
    bad = HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(400, "This reset link has expired. Request a new one.")
    except jwt.PyJWTError:
        raise bad
    if payload.get("purpose") != _RESET:
        raise bad
    user = db.get(User, int(payload["sub"]))
    if not user or payload.get("pv") != password_fingerprint(user):
        raise bad
    return user
