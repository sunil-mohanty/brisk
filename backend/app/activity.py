"""Usage tracking for the admin: active days per business and a light event log."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import ActivityDay, Business, Event

UAE = timezone(timedelta(hours=4))
_REFRESH_SECONDS = 600
_seen: dict[int, tuple[date, datetime]] = {}  # business_id -> (day recorded, last write)


def uae_today() -> date:
    return datetime.now(UAE).date()


def touch(db: Session, business_id: int) -> None:
    """Mark the business active today. Cheap: at most one write per business every 10 minutes."""
    now = datetime.now(timezone.utc)
    today = now.astimezone(UAE).date()
    last = _seen.get(business_id)
    if last and last[0] == today and (now - last[1]).total_seconds() < _REFRESH_SECONDS:
        return
    try:
        if not db.scalar(select(ActivityDay.day).where(ActivityDay.business_id == business_id, ActivityDay.day == today)):
            db.add(ActivityDay(business_id=business_id, day=today))
        db.execute(update(Business).where(Business.id == business_id).values(last_active_at=now))
        db.commit()
    except IntegrityError:  # two requests at once both inserted today's row
        db.rollback()
    _seen[business_id] = (today, now)


def record(db: Session, business_id: int, kind: str, detail: str | None = None) -> None:
    """Add a timeline event. The caller commits. Never pass a customer's name or number."""
    db.add(Event(business_id=business_id, kind=kind, detail=(detail or None) and detail[:200]))


def reset_cache() -> None:
    _seen.clear()
