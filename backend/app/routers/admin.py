"""Platform admin: who signed up, who uses it, who has paid.

Only emails listed in ADMIN_EMAILS can call these. Responses carry counts and
dates about each SME, never their customers' names or phone numbers.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..activity import UAE, record, uae_today
from ..config import get_settings
from ..db import get_db
from ..models import (
    ActivityDay,
    Business,
    Customer,
    Event,
    InviteCode,
    Lead,
    Payment,
    QRCode,
    Quote,
    QuoteStatus,
    QuoteView,
    ServiceRecord,
    User,
)
from ..models import Appointment
from ..security import create_reset_token, require_admin
from ..utils import add_months, new_token

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

STEPS = [
    ("signed_up", "Signed up"),
    ("profile", "Filled in business details"),
    ("customers", "Added customers"),
    ("qr", "Created a QR code"),
    ("quote", "Sent a quote"),
    ("opened", "A client opened a quote"),
    ("accepted", "A client accepted a quote"),
    ("booked", "Booked an appointment"),
    ("service", "Finished a visit"),
]


# ---------------------------------------------------------------- helpers
def _day(dt: datetime | None) -> date | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(UAE).date()


def payment_state(b: Business, today: date) -> str:
    if b.status == "suspended":
        return "suspended"
    if b.paid_until and b.paid_until >= today:
        return "paid"
    if b.paid_until:
        return "overdue"
    if b.trial_ends_at and b.trial_ends_at >= today:
        return "trial"
    if b.trial_ends_at:
        return "trial_ended"
    return "no_plan"


def health(last_active: date | None, started: bool, signup_age: int, today: date) -> str:
    if not started:
        return "new" if signup_age <= 3 else "never_started"
    gap = (today - last_active).days if last_active else 999
    if gap <= 7:
        return "active"
    if gap <= 21:
        return "slipping"
    return "dormant"


def _counts(db: Session, model, col=None, where=()) -> dict[int, int]:
    col = col if col is not None else model.id
    rows = db.execute(select(model.business_id, func.count(col)).where(*where).group_by(model.business_id))
    return dict(rows.all())


def _firsts(db: Session, model, col, where=()) -> dict[int, datetime]:
    rows = db.execute(select(model.business_id, func.min(col)).where(*where).group_by(model.business_id))
    return dict(rows.all())


class _Stats:
    """Everything the list and overview need, in a fixed number of queries."""

    def __init__(self, db: Session):
        now = datetime.now(timezone.utc)
        d30 = now - timedelta(days=30)
        today = uae_today()
        self.today = today
        self.customers = _counts(db, Customer)
        self.leads = _counts(db, Lead)
        self.quotes = _counts(db, Quote)
        self.quotes_30 = _counts(db, Quote, where=(Quote.created_at >= d30,))
        self.services = _counts(db, ServiceRecord)
        self.qrs = _counts(db, QRCode)
        self.scans = dict(db.execute(select(QRCode.business_id, func.coalesce(func.sum(QRCode.scans), 0)).group_by(QRCode.business_id)).all())
        self.days = _counts(db, ActivityDay, ActivityDay.day)
        self.days_30 = _counts(db, ActivityDay, ActivityDay.day, (ActivityDay.day >= today - timedelta(days=29),))
        self.first = {
            "customers": _firsts(db, Customer, Customer.created_at),
            "qr": _firsts(db, QRCode, QRCode.created_at),
            "quote": _firsts(db, Quote, Quote.created_at),
            "accepted": _firsts(db, Quote, Quote.decided_at, (Quote.status == QuoteStatus.accepted,)),
            "service": _firsts(db, ServiceRecord, ServiceRecord.created_at),
            "booked": _firsts(db, Appointment, Appointment.created_at),
        }
        self.first["opened"] = dict(
            db.execute(select(Quote.business_id, func.min(QuoteView.viewed_at)).join(Quote, Quote.id == QuoteView.quote_id).group_by(Quote.business_id)).all()
        )
        owners = db.execute(select(User).order_by(User.id)).scalars().all()
        self.owner: dict[int, User] = {}
        for u in owners:
            self.owner.setdefault(u.business_id, u)
        self.invites = {i.id: i.label for i in db.scalars(select(InviteCode))}

    def steps(self, b: Business) -> dict[str, date | None | bool]:
        out: dict[str, date | None | bool] = {"signed_up": _day(b.created_at)}
        out["profile"] = bool((b.whatsapp or b.phone) and (b.address or b.tagline or b.trn))
        for k in ("customers", "qr", "quote", "opened", "accepted", "booked", "service"):
            out[k] = _day(self.first[k].get(b.id))
        return out


# ---------------------------------------------------------------- schemas
class SmeRow(BaseModel):
    id: int
    name: str
    owner_name: str | None
    owner_email: str | None
    phone: str | None
    invite_label: str | None
    came_from: str | None = None  # invite, or ad source/campaign
    business_type: str = "unisex"
    signed_up: date
    days_since_signup: int
    days_used: int
    days_used_30: int
    last_active: datetime | None
    customers: int
    leads: int
    quotes: int
    quotes_30: int
    services: int
    qr_codes: int
    scans: int
    plan: str | None
    plan_amount: Decimal | None
    trial_ends_at: date | None
    paid_until: date | None
    status: str
    payment_state: str
    health: str
    steps_done: int


class Overview(BaseModel):
    smes: int
    active_7d: int
    paying: int
    trial: int
    overdue: int
    suspended: int
    mrr: Decimal
    trials_ending_7d: int
    funnel: list[dict]
    weeks: list[dict]
    attention: list[dict]
    sources: list[dict] = []


class PaymentOut(BaseModel):
    id: int
    amount: Decimal
    paid_on: date
    covers_until: date
    method: str | None
    note: str | None


class SmeDetail(SmeRow):
    tagline: str | None
    address: str | None
    trn: str | None
    admin_note: str | None
    link_page_enabled: bool = False
    slug: str | None = None
    steps: list[dict]
    active_days: list[date]
    events: list[dict]
    payments: list[PaymentOut]


class SmeUpdate(BaseModel):
    plan: str | None = Field(default=None, max_length=60)
    plan_amount: Decimal | None = Field(default=None, ge=0)
    trial_ends_at: date | None = None
    paid_until: date | None = None
    status: str | None = Field(default=None, pattern="^(active|suspended)$")
    admin_note: str | None = Field(default=None, max_length=5000)
    link_page_enabled: bool | None = None


class PaymentIn(BaseModel):
    amount: Decimal = Field(gt=0)
    paid_on: date | None = None
    months: int = Field(default=1, ge=1, le=36)
    method: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=300)


class InviteIn(BaseModel):
    label: str = Field(min_length=1, max_length=160)
    trial_days: int = Field(default=14, ge=0, le=365)
    plan: str | None = Field(default=None, max_length=60)
    plan_amount: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=1000)


class InviteOut(BaseModel):
    id: int
    code: str
    label: str
    note: str | None
    trial_days: int
    plan: str | None
    plan_amount: Decimal | None
    revoked: bool
    used_at: datetime | None
    used_by_business_id: int | None
    used_by_name: str | None
    signup_link: str
    created_at: datetime


# ---------------------------------------------------------------- endpoints
def _row(b: Business, st: _Stats) -> SmeRow:
    owner = st.owner.get(b.id)
    signup = _day(b.created_at) or st.today
    steps = st.steps(b)
    started = bool(steps["qr"] or steps["quote"] or steps["customers"] or steps["booked"])
    last = _day(b.last_active_at)
    return SmeRow(
        id=b.id,
        name=b.name,
        owner_name=owner.name if owner else None,
        owner_email=owner.email if owner else None,
        phone=b.whatsapp or b.phone,
        invite_label=st.invites.get(b.invite_code_id) if b.invite_code_id else None,
        came_from=(f"Invite: {st.invites.get(b.invite_code_id)}" if b.invite_code_id
                   else " · ".join(x for x in (b.signup_source, b.signup_campaign) if x) or None),
        business_type=b.business_type or "unisex",
        signed_up=signup,
        days_since_signup=(st.today - signup).days + 1,
        days_used=st.days.get(b.id, 0),
        days_used_30=st.days_30.get(b.id, 0),
        last_active=b.last_active_at,
        customers=st.customers.get(b.id, 0),
        leads=st.leads.get(b.id, 0),
        quotes=st.quotes.get(b.id, 0),
        quotes_30=st.quotes_30.get(b.id, 0),
        services=st.services.get(b.id, 0),
        qr_codes=st.qrs.get(b.id, 0),
        scans=int(st.scans.get(b.id, 0) or 0),
        plan=b.plan,
        plan_amount=b.plan_amount,
        trial_ends_at=b.trial_ends_at,
        paid_until=b.paid_until,
        status=b.status,
        payment_state=payment_state(b, st.today),
        health=health(last, started, (st.today - signup).days, st.today),
        steps_done=sum(1 for v in steps.values() if v),
    )


@router.get("/smes", response_model=list[SmeRow])
def list_smes(db: Session = Depends(get_db)):
    st = _Stats(db)
    rows = [_row(b, st) for b in db.scalars(select(Business).order_by(Business.created_at.desc()))]
    return rows


@router.get("/overview", response_model=Overview)
def overview(db: Session = Depends(get_db)):
    st = _Stats(db)
    today = st.today
    businesses = db.scalars(select(Business)).all()
    rows = [_row(b, st) for b in businesses]
    by_state = defaultdict(int)
    for r in rows:
        by_state[r.payment_state] += 1
    mrr = sum((r.plan_amount or Decimal(0) for r in rows if r.payment_state == "paid"), Decimal(0))

    funnel = []
    for key, label in STEPS:
        funnel.append({"key": key, "label": label, "count": sum(1 for b in businesses if st.steps(b)[key])})

    # last 8 weeks, Monday-start, in UAE time
    week0 = today - timedelta(days=today.weekday()) - timedelta(weeks=7)
    weeks = [{"start": week0 + timedelta(weeks=i), "active": 0, "quotes": 0, "signups": 0} for i in range(8)]
    idx = lambda d: (d - week0).days // 7 if d and d >= week0 else None  # noqa: E731
    seen = defaultdict(set)
    for bid, d in db.execute(select(ActivityDay.business_id, ActivityDay.day).where(ActivityDay.day >= week0)):
        i = idx(d)
        if i is not None and i < 8:
            seen[i].add(bid)
    for i, s in seen.items():
        weeks[i]["active"] = len(s)
    since = datetime.combine(week0, datetime.min.time(), tzinfo=UAE)
    for (c,) in db.execute(select(Quote.created_at).where(Quote.created_at >= since)):
        i = idx(_day(c))
        if i is not None and i < 8:
            weeks[i]["quotes"] += 1
    for b in businesses:
        i = idx(_day(b.created_at))
        if i is not None and i < 8:
            weeks[i]["signups"] += 1

    attention = []
    for r in rows:
        if r.status == "suspended":
            continue
        if r.payment_state == "overdue":
            attention.append({"id": r.id, "name": r.name, "kind": "overdue", "text": f"Payment overdue since {r.paid_until:%d %b}"})
        elif r.payment_state == "trial" and r.trial_ends_at and (r.trial_ends_at - today).days <= 7:
            left = (r.trial_ends_at - today).days
            attention.append({"id": r.id, "name": r.name, "kind": "trial_ending", "text": "Trial ends today" if left == 0 else f"Trial ends in {left} day{'s' if left != 1 else ''}"})
        elif r.payment_state == "trial_ended":
            attention.append({"id": r.id, "name": r.name, "kind": "trial_ended", "text": f"Trial ended {r.trial_ends_at:%d %b}, not paid yet"})
        if r.health == "never_started":
            attention.append({"id": r.id, "name": r.name, "kind": "never_started", "text": f"Signed up {r.days_since_signup - 1} days ago, hasn't started"})
        elif r.health in ("slipping", "dormant") and r.last_active:
            gap = (today - _day(r.last_active)).days
            attention.append({"id": r.id, "name": r.name, "kind": r.health, "text": f"Not used for {gap} days"})

    # Which ads / sites bring SMEs, and which of them go on to use it and pay
    src = defaultdict(lambda: {"smes": 0, "active": 0, "paying": 0})
    by_id = {b.id: b for b in businesses}
    for r in rows:
        b = by_id[r.id]
        key = "Invite code" if b.invite_code_id else (b.signup_source or "Direct / unknown")
        src[key]["smes"] += 1
        src[key]["active"] += r.health == "active"
        src[key]["paying"] += r.payment_state == "paid"
    sources = sorted(({"source": k, **v} for k, v in src.items()), key=lambda x: -x["smes"])

    return Overview(
        smes=len(rows),
        active_7d=sum(1 for r in rows if r.last_active and (today - _day(r.last_active)).days <= 6),
        paying=by_state["paid"],
        trial=by_state["trial"],
        overdue=by_state["overdue"] + by_state["trial_ended"],
        suspended=by_state["suspended"],
        mrr=mrr,
        trials_ending_7d=sum(1 for r in rows if r.payment_state == "trial" and r.trial_ends_at and (r.trial_ends_at - today).days <= 7),
        funnel=funnel,
        weeks=[{**w, "start": w["start"].isoformat()} for w in weeks],
        attention=attention,
        sources=sources,
    )


def _detail(db: Session, b: Business) -> SmeDetail:
    st = _Stats(db)
    row = _row(b, st)
    steps = st.steps(b)
    days = db.scalars(
        select(ActivityDay.day).where(ActivityDay.business_id == b.id, ActivityDay.day >= st.today - timedelta(days=119)).order_by(ActivityDay.day)
    ).all()
    events = db.scalars(select(Event).where(Event.business_id == b.id).order_by(Event.created_at.desc(), Event.id.desc()).limit(60)).all()
    payments = db.scalars(select(Payment).where(Payment.business_id == b.id).order_by(Payment.paid_on.desc(), Payment.id.desc())).all()
    return SmeDetail(
        **row.model_dump(),
        tagline=b.tagline,
        address=b.address,
        trn=b.trn,
        admin_note=b.admin_note,
        link_page_enabled=b.link_page_enabled,
        slug=b.slug,
        steps=[{"key": k, "label": label, "done": bool(steps[k]), "date": steps[k] if isinstance(steps[k], date) else None} for k, label in STEPS],
        active_days=list(days),
        events=[{"kind": e.kind, "detail": e.detail, "at": e.created_at} for e in events],
        payments=[PaymentOut.model_validate(p, from_attributes=True) for p in payments],
    )


def _biz(db: Session, sme_id: int) -> Business:
    b = db.get(Business, sme_id)
    if not b:
        raise HTTPException(404, "SME not found")
    return b


@router.get("/smes/{sme_id}", response_model=SmeDetail)
def get_sme(sme_id: int, db: Session = Depends(get_db)):
    return _detail(db, _biz(db, sme_id))


@router.patch("/smes/{sme_id}", response_model=SmeDetail)
def update_sme(sme_id: int, body: SmeUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    b = _biz(db, sme_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("status") == "suspended" and b.id == admin.business_id:
        raise HTTPException(409, "You can't pause your own account.")
    for k, v in changes.items():
        setattr(b, k, v)
    if "status" in changes:
        record(db, b.id, "account_" + ("paused" if b.status == "suspended" else "reactivated"))
    if changes.get("link_page_enabled") is not None:
        record(db, b.id, "link_page_" + ("enabled" if b.link_page_enabled else "disabled"))
    db.commit()
    return _detail(db, b)


@router.post("/smes/{sme_id}/payments", response_model=SmeDetail, status_code=201)
def add_payment(sme_id: int, body: PaymentIn, db: Session = Depends(get_db)):
    b = _biz(db, sme_id)
    paid_on = body.paid_on or uae_today()
    start = max(b.paid_until, paid_on) if b.paid_until else max(paid_on, b.trial_ends_at or paid_on)
    covers = add_months(start, body.months)
    db.add(Payment(business_id=b.id, amount=body.amount, paid_on=paid_on, covers_until=covers, method=body.method, note=body.note))
    b.paid_until = covers
    record(db, b.id, "payment_recorded", f"{b.currency} {body.amount:,.2f} · until {covers:%d %b %Y}")
    db.commit()
    return _detail(db, b)


@router.delete("/smes/{sme_id}/payments/{payment_id}", response_model=SmeDetail)
def delete_payment(sme_id: int, payment_id: int, db: Session = Depends(get_db)):
    """Undo a mistaken entry. 'Paid until' falls back to the latest remaining payment."""
    b = _biz(db, sme_id)
    p = db.get(Payment, payment_id)
    if not p or p.business_id != b.id:
        raise HTTPException(404, "Payment not found")
    db.delete(p)
    db.flush()
    b.paid_until = db.scalar(select(func.max(Payment.covers_until)).where(Payment.business_id == b.id))
    db.commit()
    return _detail(db, b)


@router.post("/smes/{sme_id}/reset-link")
def reset_link(sme_id: int, db: Session = Depends(get_db)):
    """A one-time password reset link for the owner, to send them yourself (e.g. on WhatsApp)."""
    b = _biz(db, sme_id)
    owner = db.scalar(select(User).where(User.business_id == b.id).order_by(User.id))
    if not owner:
        raise HTTPException(404, "This SME has no user")
    s = get_settings()
    link = f"{s.app_url.rstrip('/')}/reset-password?token={create_reset_token(owner)}"
    return {"link": link, "email": owner.email, "expires_minutes": s.password_reset_minutes}


# ---------------------------------------------------------------- invite codes
def _invite_out(i: InviteCode, names: dict[int, str]) -> InviteOut:
    return InviteOut(
        **{k: getattr(i, k) for k in ("id", "code", "label", "note", "trial_days", "plan", "plan_amount", "revoked", "used_at", "used_by_business_id", "created_at")},
        used_by_name=names.get(i.used_by_business_id) if i.used_by_business_id else None,
        signup_link=f"{get_settings().app_url.rstrip('/')}/signup?code={i.code}",
    )


def _names(db: Session) -> dict[int, str]:
    return dict(db.execute(select(Business.id, Business.name)).all())


@router.get("/invites", response_model=list[InviteOut])
def list_invites(db: Session = Depends(get_db)):
    names = _names(db)
    return [_invite_out(i, names) for i in db.scalars(select(InviteCode).order_by(InviteCode.created_at.desc(), InviteCode.id.desc()))]


@router.post("/invites", response_model=InviteOut, status_code=201)
def create_invite(body: InviteIn, db: Session = Depends(get_db)):
    code = f"SAL-{new_token(4)}-{new_token(4)}"
    while db.scalar(select(InviteCode.id).where(InviteCode.code == code)):
        code = f"SAL-{new_token(4)}-{new_token(4)}"
    i = InviteCode(code=code, **body.model_dump())
    db.add(i)
    db.commit()
    return _invite_out(i, {})


@router.post("/invites/{invite_id}/revoke", response_model=InviteOut)
def revoke_invite(invite_id: int, db: Session = Depends(get_db)):
    i = db.get(InviteCode, invite_id)
    if not i:
        raise HTTPException(404, "Invite code not found")
    i.revoked = True
    db.commit()
    return _invite_out(i, _names(db))
