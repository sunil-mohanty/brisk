"""Free slots and self-booking, for clients who accept a quote or a campaign offer."""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .activity import UAE, record
from .logic import appointment_url, set_lead_status
from .models import Appointment, AppointmentStatus, Business, CatalogItem, LeadStatus, Quote, Stylist
from .utils import new_token, quote_totals
from . import whatsapp

STEP_MIN = 30
BOOK_AHEAD_DAYS = 30
FREE = (AppointmentStatus.cancelled, AppointmentStatus.no_show)


def _hm(v: str, default: str) -> time:
    try:
        h, m = (v or default).split(":")
        return time(int(h), int(m))
    except ValueError:
        h, m = default.split(":")
        return time(int(h), int(m))


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=UAE) if dt.tzinfo is None else dt.astimezone(UAE)


def closed_days(b: Business) -> set[int]:
    return {int(x) for x in (b.closed_days or "").split(",") if x.strip().isdigit()}


def quote_duration(db: Session, q: Quote) -> int:
    """Minutes for a quote: the menu times of its lines (x quantity), or 60 if none are known."""
    menu = {c.name.strip().lower(): c.duration_min for c in db.scalars(select(CatalogItem).where(CatalogItem.business_id == q.business_id))}
    mins = sum((menu.get(i.description.strip().lower()) or 0) * max(1, int(i.quantity)) for i in q.items)
    return min(max(mins, 30), 480) if mins else 60


def _busy(db: Session, business_id: int, day: date) -> list[Appointment]:
    start = datetime.combine(day, time.min, tzinfo=UAE)
    return db.scalars(
        select(Appointment).where(
            Appointment.business_id == business_id,
            Appointment.starts_at >= start - timedelta(hours=12),
            Appointment.starts_at < start + timedelta(days=1),
            Appointment.status.not_in(FREE),
        )
    ).all()


def _free_stylist(team: list[Stylist], busy: list[Appointment], start: datetime, minutes: int) -> Stylist | None | bool:
    """A stylist free for the whole slot; True when the salon has no team and the chair is free; False if full."""
    end = start + timedelta(minutes=minutes)

    def overlaps(a: Appointment) -> bool:
        s = _aware(a.starts_at)
        return s < end and s + timedelta(minutes=a.duration_min) > start

    clashing = [a for a in busy if overlaps(a)]
    if not team:
        return True if not clashing else False
    if any(a.stylist_id is None for a in clashing) and len(clashing) >= len(team):
        return False
    taken = {a.stylist_id for a in clashing}
    for m in team:
        if m.id not in taken:
            return m
    return False


def free_slots(db: Session, b: Business, day: date, minutes: int) -> list[str]:
    now = datetime.now(UAE)
    if day < now.date() or day > now.date() + timedelta(days=BOOK_AHEAD_DAYS) or day.weekday() in closed_days(b):
        return []
    team = db.scalars(select(Stylist).where(Stylist.business_id == b.id, Stylist.active.is_(True)).order_by(Stylist.position, Stylist.id)).all()
    busy = _busy(db, b.id, day)
    opens = datetime.combine(day, _hm(b.open_time, "10:00"), tzinfo=UAE)
    closes = datetime.combine(day, _hm(b.close_time, "22:00"), tzinfo=UAE)
    out, t = [], opens
    while t + timedelta(minutes=minutes) <= closes:
        if t > now + timedelta(minutes=30) and _free_stylist(team, busy, t, minutes) is not False:
            out.append(f"{t:%H:%M}")
        t += timedelta(minutes=STEP_MIN)
    return out


def when_text(dt: datetime) -> str:
    return _aware(dt).strftime("%a %d %b, %I:%M %p").replace(" 0", " ")


def try_book(db: Session, q: Quote, day: date, hhmm: str) -> Appointment | None:
    """Books the client in if the slot is still free. Returns None when it isn't (the quote then waits)."""
    b = q.business
    minutes = quote_duration(db, q)
    if hhmm not in free_slots(db, b, day, minutes):
        return None
    start = datetime.combine(day, _hm(hhmm, "10:00"), tzinfo=UAE)
    team = db.scalars(select(Stylist).where(Stylist.business_id == b.id, Stylist.active.is_(True)).order_by(Stylist.position, Stylist.id)).all()
    who = _free_stylist(team, _busy(db, b.id, day), start, minutes)
    token = new_token(10)
    while db.scalar(select(Appointment.id).where(Appointment.token == token)):
        token = new_token(10)
    a = Appointment(
        business_id=b.id, customer_id=q.customer_id, stylist_id=who.id if isinstance(who, Stylist) else None,
        lead_id=q.lead_id, quote_id=q.id, token=token,
        service=" + ".join(i.description for i in q.items)[:300] or "Appointment",
        starts_at=start, duration_min=minutes, price=quote_totals(q.items, q.discount, q.vat_rate).total,
        status=AppointmentStatus.confirmed, confirmed_at=datetime.now(timezone.utc),
        notes=f"Booked online by the client when accepting quote Q-{q.number}.",
    )
    db.add(a)
    db.flush()
    q.booking_status = "confirmed"
    set_lead_status(db, q.lead_id, LeadStatus.won)
    record(db, b.id, "appointment_self_booked")
    confirm(db, a)
    return a


def confirm(db: Session, a: Appointment) -> None:
    """The immediate booking confirmation to the client (automatic when WhatsApp is connected)."""
    c = a.customer if a.customer is not None else None
    first = (c.name.split()[0] if c and c.name else "") or "there"
    b = a.business if a.business is not None else db.get(Business, a.business_id)
    who = f" with {a.stylist.name}" if a.stylist else ""
    when = when_text(a.starts_at)
    body = f"Hi {first}, your {a.service}{who} at {b.name} is confirmed for {when}. Details and add to calendar: {appointment_url(a)}"
    whatsapp.send(
        db, business_id=a.business_id, phone=c.phone if c else None, name=c.name if c else None,
        kind="booking_confirmed", body=body, template_params=[first, a.service, when, b.name], appointment_id=a.id,
    )
