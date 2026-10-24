"""Appointments: the salon diary. A lead or accepted quote becomes a booked job; finishing
it creates the visit record with the client's next-visit reminder."""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import schemas as s
from ..activity import UAE, record
from ..db import get_db
from ..logic import appointment_out, appointment_url, get_owned, resolve_customer, set_lead_status
from ..models import (
    Appointment,
    AppointmentStatus,
    Lead,
    LeadStatus,
    Quote,
    QuoteStatus,
    ServiceRecord,
    Stylist,
    User,
)
from ..security import current_user
from ..utils import new_token, whatsapp_link

router = APIRouter(prefix="/appointments", tags=["appointments"])

# These no longer hold the chair, so they never clash with a new booking.
FREE_STATUSES = (AppointmentStatus.cancelled, AppointmentStatus.no_show)
_LOAD = (joinedload(Appointment.customer), joinedload(Appointment.stylist))


def _aware(dt: datetime) -> datetime:
    """Times without a zone are taken as UAE local time (what the owner typed). Everything is
    kept in UAE time so day boundaries and messages line up on every database."""
    return dt.replace(tzinfo=UAE) if dt.tzinfo is None else dt.astimezone(UAE)


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min, tzinfo=UAE)
    return start, start + timedelta(days=1)


def local_when(dt: datetime) -> str:
    """'Sat 25 Oct, 4:30 PM' in UAE time."""
    return _aware(dt).astimezone(UAE).strftime("%a %d %b, %I:%M %p").replace(" 0", " ")


def _check_stylist(db: Session, business_id: int, stylist_id: int | None) -> Stylist | None:
    if stylist_id is None:
        return None
    m = get_owned(db, Stylist, stylist_id, business_id, "Team member")
    if not m.active:
        raise HTTPException(409, f"{m.name} is no longer on the team")
    return m


def _clash(db: Session, business_id: int, stylist_id: int | None, start: datetime, minutes: int, ignore_id: int | None = None) -> Appointment | None:
    """Another live booking for the same stylist that overlaps this time, if any."""
    if stylist_id is None:
        return None
    start = _aware(start)
    end = start + timedelta(minutes=minutes)
    # Look a day either side, then compare exactly in Python (works the same on SQLite and Postgres).
    window = db.scalars(
        select(Appointment)
        .where(
            Appointment.business_id == business_id,
            Appointment.stylist_id == stylist_id,
            Appointment.status.not_in(FREE_STATUSES),
            Appointment.starts_at >= start - timedelta(hours=24),
            Appointment.starts_at < end,
        )
        .options(joinedload(Appointment.customer))
    ).all()
    for a in window:
        if a.id == ignore_id:
            continue
        a_start = _aware(a.starts_at)
        if a_start < end and a_start + timedelta(minutes=a.duration_min) > start:
            return a
    return None


def _clash_error(a: Appointment, stylist: Stylist) -> HTTPException:
    return HTTPException(
        409,
        {
            "code": "clash",
            "message": f"{stylist.name} already has {a.customer.name} ({a.service}) at {local_when(a.starts_at)}.",
        },
    )


@router.get("", response_model=list[s.AppointmentOut])
def list_appointments(
    start: date | None = None,
    end: date | None = None,
    stylist_id: int | None = None,
    customer_id: int | None = None,
    status: AppointmentStatus | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Appointments from `start` up to and including `end` (UAE days). Default: today and the next 6 days."""
    first = start or datetime.now(UAE).date()
    last = end or first + timedelta(days=6)
    if (last - first).days > 92:
        raise HTTPException(422, "Ask for 3 months or less at a time")
    stmt = (
        select(Appointment)
        .where(
            Appointment.business_id == user.business_id,
            Appointment.starts_at >= _day_bounds(first)[0],
            Appointment.starts_at < _day_bounds(last)[1],
        )
        .options(*_LOAD)
        .order_by(Appointment.starts_at, Appointment.id)
    )
    if customer_id is not None:
        stmt = select(Appointment).where(Appointment.business_id == user.business_id, Appointment.customer_id == customer_id).options(*_LOAD).order_by(Appointment.starts_at.desc())
    if stylist_id is not None:
        stmt = stmt.where(Appointment.stylist_id == stylist_id)
    if status is not None:
        stmt = stmt.where(Appointment.status == status)
    return [appointment_out(a) for a in db.scalars(stmt).unique()]


@router.post("", response_model=s.AppointmentOut, status_code=201)
def create_appointment(body: s.AppointmentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    bid = user.business_id
    lead = get_owned(db, Lead, body.lead_id, bid, "Lead") if body.lead_id else None
    quote = get_owned(db, Quote, body.quote_id, bid, "Quote") if body.quote_id else None
    if quote and quote.status != QuoteStatus.accepted:
        raise HTTPException(409, "Only accepted quotes can be booked")
    if lead:
        customer = lead.customer
    elif quote:
        customer = quote.customer
    else:
        customer = resolve_customer(db, bid, body)
    stylist = _check_stylist(db, bid, body.stylist_id)
    starts = _aware(body.starts_at)
    if stylist and not body.force:
        other = _clash(db, bid, stylist.id, starts, body.duration_min)
        if other:
            raise _clash_error(other, stylist)
    token = new_token(10)
    while db.scalar(select(Appointment.id).where(Appointment.token == token)):
        token = new_token(10)
    a = Appointment(
        business_id=bid,
        customer_id=customer.id,
        stylist_id=stylist.id if stylist else None,
        lead_id=lead.id if lead else (quote.lead_id if quote else None),
        quote_id=quote.id if quote else None,
        token=token,
        service=body.service.strip(),
        starts_at=starts,
        duration_min=body.duration_min,
        price=body.price,
        location=body.location,
        address=(body.address or "").strip() or None,
        notes=body.notes,
    )
    db.add(a)
    if quote:
        quote.booking_status = "confirmed"
    # Booking is the win for a lead.
    set_lead_status(db, a.lead_id, LeadStatus.won, only_from=(LeadStatus.new, LeadStatus.contacted, LeadStatus.quoted))
    record(db, bid, "appointment_booked")
    db.commit()
    db.refresh(a)
    return appointment_out(a)


@router.get("/{appointment_id}", response_model=s.AppointmentOut)
def get_appointment(appointment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return appointment_out(get_owned(db, Appointment, appointment_id, user.business_id, "Appointment"))


@router.patch("/{appointment_id}", response_model=s.AppointmentOut)
def update_appointment(appointment_id: int, body: s.AppointmentUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = get_owned(db, Appointment, appointment_id, user.business_id, "Appointment")
    changes = body.model_dump(exclude_unset=True)
    force = changes.pop("force", False)
    if a.status == AppointmentStatus.completed and set(changes) - {"notes"}:
        raise HTTPException(409, "This appointment is finished. Change the visit record instead.")
    if changes.get("status") == AppointmentStatus.completed:
        raise HTTPException(422, "Use 'Finish' to complete an appointment, so the visit is recorded")
    if "stylist_id" in changes:
        _check_stylist(db, user.business_id, changes["stylist_id"])
    if "starts_at" in changes and changes["starts_at"] is not None:
        changes["starts_at"] = _aware(changes["starts_at"])
    for k, v in changes.items():
        if k in ("service", "address") and isinstance(v, str):
            v = v.strip() or (None if k == "address" else v)
        if v is None and k in ("service", "starts_at", "duration_min", "price", "location", "status"):
            continue
        setattr(a, k, v)
    moved = {"starts_at", "duration_min", "stylist_id"} & set(changes)
    reopened = changes.get("status") in (AppointmentStatus.booked, AppointmentStatus.confirmed, AppointmentStatus.arrived)
    if (moved or reopened) and a.stylist_id and a.status not in FREE_STATUSES and not force:
        other = _clash(db, user.business_id, a.stylist_id, a.starts_at, a.duration_min, ignore_id=a.id)
        if other:
            db.rollback()
            raise _clash_error(other, db.get(Stylist, a.stylist_id))
    if "starts_at" in changes and a.status == AppointmentStatus.confirmed:
        a.status = AppointmentStatus.booked  # new time needs confirming again
        a.confirmed_at = None
    if changes.get("status") == AppointmentStatus.confirmed and not a.confirmed_at:
        a.confirmed_at = datetime.now(timezone.utc)
    if changes.get("status") in FREE_STATUSES:
        record(db, user.business_id, f"appointment_{changes['status'].value}")
    db.commit()
    db.refresh(a)
    return appointment_out(a)


@router.post("/{appointment_id}/complete", response_model=s.AppointmentOut)
def complete_appointment(appointment_id: int, body: s.AppointmentCompleteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Finishes the job: records the visit (with the client's history link) and sets the rebook reminder."""
    a = get_owned(db, Appointment, appointment_id, user.business_id, "Appointment")
    if a.status == AppointmentStatus.completed:
        raise HTTPException(409, "This appointment is already finished")
    if a.status in FREE_STATUSES:
        raise HTTPException(409, f"This appointment was marked {a.status.value.replace('_', '-')}. Re-open it first.")
    if body.price is not None:
        a.price = body.price
    if body.notes is not None:
        a.notes = body.notes
    day = _aware(a.starts_at).astimezone(UAE).date()
    token = new_token(8)
    while db.scalar(select(ServiceRecord.id).where(ServiceRecord.token == token)):
        token = new_token(8)
    visit = ServiceRecord(
        business_id=a.business_id,
        customer_id=a.customer_id,
        quote_id=a.quote_id,
        token=token,
        service=a.service,
        service_date=day,
        amount=a.price or Decimal("0"),
        technician=a.stylist.name if a.stylist else None,
        notes=a.notes,
        reference="Home visit" + (f" · {a.address}" if a.address else "") if a.location == "home" else None,
        next_service_date=day + timedelta(weeks=body.next_visit_weeks) if body.next_visit_weeks else None,
    )
    db.add(visit)
    db.flush()
    a.service_record_id = visit.id
    a.status = AppointmentStatus.completed
    record(db, user.business_id, "service_recorded")
    db.commit()
    db.refresh(a)
    return appointment_out(a)


@router.post("/{appointment_id}/message", response_model=s.MessageLinkOut)
def message(
    appointment_id: int,
    kind: str = Query(pattern="^(confirm|reminder|cancel)$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """A ready-to-send WhatsApp message to the client. The owner taps it to send from their own phone."""
    a = get_owned(db, Appointment, appointment_id, user.business_id, "Appointment")
    first = a.customer.name.split()[0] if a.customer.name else ""
    biz = user.business.name
    when = local_when(a.starts_at)
    who = f" with {a.stylist.name}" if a.stylist else ""
    where = " (home visit)" if a.location == "home" else ""
    link = appointment_url(a)
    if kind == "confirm":
        msg = f"Hi {first}, your {a.service}{who} at {biz} is booked for {when}{where}. Details and add to calendar: {link}"
        if a.status == AppointmentStatus.booked:
            a.status = AppointmentStatus.confirmed
        a.confirmed_at = a.confirmed_at or datetime.now(timezone.utc)
        record(db, user.business_id, "appointment_confirmed")
    elif kind == "reminder":
        msg = f"Hi {first}, a reminder of your {a.service}{who} at {biz} on {when}{where}. See you soon! {link}"
        a.reminded_at = datetime.now(timezone.utc)
        record(db, user.business_id, "appointment_reminded")
    else:
        msg = f"Hi {first}, your {a.service} at {biz} on {when} is cancelled. Reply here if you'd like a new time."
    db.commit()
    return s.MessageLinkOut(whatsapp_url=whatsapp_link(a.customer.phone, msg), message=msg)


@router.delete("/{appointment_id}", status_code=204)
def delete_appointment(appointment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = get_owned(db, Appointment, appointment_id, user.business_id, "Appointment")
    if a.status == AppointmentStatus.completed:
        raise HTTPException(409, "Finished appointments are kept as part of the client's history")
    db.delete(a)
    db.commit()
