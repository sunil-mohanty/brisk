import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..config import get_settings
from ..db import SessionLocal, get_db
from ..email import password_reset_email, send_email
from ..activity import record, touch, uae_today
from ..logic import unique_slug
from ..models import Business, InviteCode, User
from ..security import (
    create_reset_token,
    create_token,
    current_user,
    SUSPENDED_MESSAGE,
    hash_password,
    is_admin,
    user_from_reset_token,
    verify_password,
)

router = APIRouter(tags=["auth"])


def _auth(user: User) -> s.AuthOut:
    return s.AuthOut(
        token=create_token(user),
        user=s.UserOut(id=user.id, name=user.name, email=user.email, is_admin=is_admin(user), seen_tips=_tips(user)),
        business=s.BusinessOut.model_validate(user.business),
    )


def _tips(user: User) -> list[str]:
    return [t for t in (user.seen_tips or "").split(",") if t]


def _check_invite(db: Session, raw: str | None) -> InviteCode | None:
    """Returns the per-SME invite used, or None when the legacy shared code / open sign-up applies."""
    settings = get_settings()
    code = (raw or "").strip().upper()
    if code:
        invite = db.scalar(select(InviteCode).where(InviteCode.code == code).with_for_update())
        if invite:
            if invite.revoked:
                raise HTTPException(403, f"That invite code has been switched off. Contact {settings.brand_name} for a new one.")
            if invite.used_at:
                raise HTTPException(403, "That invite code has already been used. Each code works for one business.")
            return invite
        legacy = settings.signup_code
        if legacy and secrets.compare_digest((raw or "").strip(), legacy):
            return None
        raise HTTPException(403, f"That invite code isn't valid. Check it, or contact {settings.brand_name} for one.")
    if settings.open_signup:
        return None
    raise HTTPException(403, f"You need an invite code to create an account. Contact {settings.brand_name} to get one.")


_signups_by_ip: dict[str, list[float]] = {}


def _limit_signups(ip: str) -> None:
    """Stops one address creating dozens of accounts (bots, abuse of free trials)."""
    now = time.monotonic()
    recent = [t for t in _signups_by_ip.get(ip, []) if now - t < 3600]
    if len(recent) >= get_settings().signups_per_ip_per_hour:
        raise HTTPException(429, "Too many new accounts from this connection. Try again in an hour.")
    recent.append(now)
    _signups_by_ip[ip] = recent


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "?")


@router.post("/auth/signup", response_model=s.AuthOut, status_code=201)
def signup(body: s.SignupIn, request: Request, db: Session = Depends(get_db)):
    invite = _check_invite(db, body.invite_code)
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    _limit_signups(_client_ip(request))
    settings = get_settings()
    biz = Business(
        name=body.business_name.strip(), phone=body.phone, whatsapp=body.phone, email=email,
        business_type=s.clean_business_type(body.business_type),
        signup_source=(body.source or "").strip().lower()[:120] or None,
        signup_campaign=(body.campaign or "").strip()[:160] or None,
    )
    if invite:
        biz.invite_code_id = invite.id
        biz.plan, biz.plan_amount = invite.plan, invite.plan_amount
        if invite.trial_days:
            biz.trial_ends_at = uae_today() + timedelta(days=invite.trial_days)
    else:
        # Self-serve sign-up from the website: automatic free trial.
        biz.plan = settings.signup_plan
        biz.plan_amount = settings.signup_plan_amount
        if settings.signup_trial_days:
            biz.trial_ends_at = uae_today() + timedelta(days=settings.signup_trial_days)
    biz.slug = unique_slug(db, biz.name)  # their link-in-bio page works from day one
    db.add(biz)
    db.flush()
    if invite:
        invite.used_at = datetime.now(timezone.utc)
        invite.used_by_business_id = biz.id
    user = User(business_id=biz.id, email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    via = f"Invite: {invite.label}" if invite else " · ".join(x for x in (biz.signup_source, biz.signup_campaign) if x) or "Website"
    record(db, biz.id, "signup", via)
    db.commit()
    db.refresh(user)
    return _auth(user)


@router.post("/auth/login", response_model=s.AuthOut)
def login(body: s.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    if user.business.status == "suspended" and not is_admin(user):
        raise HTTPException(403, SUSPENDED_MESSAGE)
    record(db, user.business_id, "login")
    db.commit()
    touch(db, user.business_id)
    return _auth(user)


_last_reset_request: dict[str, float] = {}
_RESET_COOLDOWN_SECONDS = 60


def _send_reset_email(user_id: int) -> None:
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            return
        settings = get_settings()
        link = f"{settings.app_url.rstrip('/')}/reset-password?token={create_reset_token(user)}"
        subject, html, text = password_reset_email(user.name, link, settings.password_reset_minutes)
        send_email(user.email, subject, html, text)
    finally:
        db.close()


@router.post("/auth/forgot-password", response_model=s.MessageOut)
def forgot_password(body: s.ForgotPasswordIn, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Always gives the same answer, so nobody can use it to check which emails have accounts."""
    email = body.email.lower()
    now = time.monotonic()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user and now - _last_reset_request.get(email, -1e9) >= _RESET_COOLDOWN_SECONDS:
        _last_reset_request[email] = now
        tasks.add_task(_send_reset_email, user.id)
    return s.MessageOut(message="If an account exists for that email, we've sent a link to reset the password.")


@router.post("/auth/reset-password", response_model=s.AuthOut)
def reset_password(body: s.ResetPasswordIn, db: Session = Depends(get_db)):
    user = user_from_reset_token(db, body.token)
    user.password_hash = hash_password(body.password)
    record(db, user.business_id, "password_reset")
    db.commit()
    db.refresh(user)
    _last_reset_request.pop(user.email, None)
    return _auth(user)


@router.get("/me", response_model=s.AuthOut)
def me(user: User = Depends(current_user)):
    return _auth(user)


@router.post("/me/tips", response_model=list[str])
def tips_seen(body: s.TipsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Remembers which first-time tips were dismissed (or clears them for "Show tips again")."""
    seen = [] if body.reset else _tips(user)
    if body.enabled is not None:
        seen = [t for t in seen if t != "all-off"] + ([] if body.enabled else ["all-off"])
    for t in body.seen:
        t = "".join(ch for ch in t if ch.isalnum() or ch in "-_.")[:40]
        if t and t not in seen:
            seen.append(t)
    user.seen_tips = ",".join(seen[-200:])
    db.commit()
    return seen


@router.get("/business", response_model=s.BusinessOut)
def get_business(user: User = Depends(current_user)):
    return user.business


@router.patch("/business", response_model=s.BusinessOut)
def update_business(body: s.BusinessUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    biz = user.business
    changes = body.model_dump(exclude_unset=True)
    if "business_type" in changes:
        changes["business_type"] = s.clean_business_type(changes["business_type"])
    if changes.get("checklist_hidden") is None:
        changes.pop("checklist_hidden", None)
    for k, v in changes.items():
        setattr(biz, k, v)
    if set(changes) - {"checklist_hidden"}:
        record(db, biz.id, "profile_updated")
    db.commit()
    db.refresh(biz)
    return biz
