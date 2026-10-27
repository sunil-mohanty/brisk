"""Staff rules shared by the diary, self-booking and the Staff pages: who may do what, who is working
when, who can do which service, attendance status and commission."""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .activity import UAE
from .models import Attendance, Business, CatalogItem, LeaveRequest, Stylist, User

ROLES = ("owner", "manager", "staff")
# What a staff login may see, beyond their own diary, clock-in and leave.
PERMISSIONS = {
    "diary_all": "See everyone's diary, not just their own",
    "clients": "Open clients, enquiries, quotes and visit records",
    "phones": "See client mobile numbers",
    "earnings": "See their own commission",
    "book": "Add and move appointments",
}
DEFAULT_PERMISSIONS = ["phones", "earnings"]
LATE_GRACE_MIN = 10
LEAVE_KINDS = ("annual", "sick", "unpaid", "other")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


# ---------------------------------------------------------------- roles and permissions
def role(user: User) -> str:
    return user.role if user.role in ROLES else "owner"


def is_manager(user: User) -> bool:
    """Owners and managers run the business; staff logins see their own work."""
    return role(user) in ("owner", "manager")


def can(user: User, perm: str) -> bool:
    if is_manager(user):
        return True
    st = user.stylist
    return bool(st and st.active and perm in (st.permissions or []))


def permissions_of(user: User) -> list[str]:
    return list(PERMISSIONS) if is_manager(user) else [p for p in PERMISSIONS if can(user, p)]


# ---------------------------------------------------------------- working hours and leave
def _hm(v: str | None) -> time | None:
    try:
        h, m = (v or "").split(":")
        return time(int(h), int(m))
    except ValueError:
        return None


def closed_days(b: Business) -> set[int]:
    return {int(x) for x in (b.closed_days or "").split(",") if x.strip().isdigit()}


def hours_on(st: Stylist, b: Business, day: date) -> tuple[time, time] | None:
    """This person's working hours on a day, or None for a day off. No hours set = the salon's hours."""
    wh = st.working_hours or {}
    if not wh:
        if day.weekday() in closed_days(b):
            return None
        return _hm(b.open_time) or time(10), _hm(b.close_time) or time(22)
    span = wh.get(str(day.weekday()))
    if not span:
        return None
    a, z = _hm(span[0]), _hm(span[1])
    return (a, z) if a and z and z > a else None


def week_hours(st: Stylist, b: Business) -> dict[str, list[str] | None]:
    """Mon..Sun as shown in the profile ("0".."6"), filled in from the salon's hours when none are set."""
    out = {}
    for d in range(7):
        h = hours_on(st, b, date(2024, 1, 1) + timedelta(days=d))  # 1 Jan 2024 was a Monday
        out[str(d)] = [f"{h[0]:%H:%M}", f"{h[1]:%H:%M}"] if h else None
    return out


def leave_on(db: Session, business_id: int, first: date, last: date) -> list[LeaveRequest]:
    return db.scalars(select(LeaveRequest).where(
        LeaveRequest.business_id == business_id, LeaveRequest.status == "approved",
        LeaveRequest.start_date <= last, LeaveRequest.end_date >= first)).all()


def on_leave_ids(db: Session, business_id: int, day: date) -> set[int]:
    return {lv.stylist_id for lv in leave_on(db, business_id, day, day)}


# ---------------------------------------------------------------- skills
@dataclass
class Menu:
    """The service menu by lower-case name, for matching appointment text to skills and categories."""
    items: dict[str, CatalogItem] = field(default_factory=dict)

    @classmethod
    def load(cls, db: Session, business_id: int) -> "Menu":
        return cls({c.name.strip().lower(): c for c in db.scalars(select(CatalogItem).where(CatalogItem.business_id == business_id))})

    def parts(self, service: str) -> list[tuple[str, CatalogItem | None]]:
        """"Haircut + Gel manicure" -> each part with its menu item (None if it isn't on the menu)."""
        return [(p, self.items.get(p.lower())) for p in (x.strip() for x in (service or "").split(" + ")) if p]

    def needs(self, service: str) -> set[int]:
        return {c.id for _, c in self.parts(service) if c}


def can_do(st: Stylist, needs: set[int]) -> bool:
    return not st.skill_ids or not needs or needs <= set(st.skill_ids)


def why_not(st: Stylist, b: Business, start: datetime, minutes: int, needs: set[int], leave_ids: set[int], menu: Menu | None = None) -> str | None:
    """Why this person can't take this booking (None = they can). Clashes are checked separately."""
    start = start.astimezone(UAE)
    day = start.date()
    if not st.active:
        return "No longer on the team"
    if st.id in leave_ids:
        return "On leave"
    h = hours_on(st, b, day)
    if not h:
        return "Day off"
    if not can_do(st, needs):
        if menu:
            names = [c.name for c in menu.items.values() if c.id in needs - set(st.skill_ids)]
            return f"Doesn't do {', '.join(names[:2])}" if names else "Doesn't do this service"
        return "Doesn't do this service"
    end = start + timedelta(minutes=minutes)
    if start.time() < h[0] or (end.date() > day) or end.time() > h[1]:
        return f"Works {h[0]:%H:%M}–{h[1]:%H:%M}"
    return None


# ---------------------------------------------------------------- attendance
def day_status(st: Stylist, b: Business, day: date, rec: Attendance | None, on_leave: bool, now: datetime | None = None) -> str:
    """present | late | absent | leave | off | upcoming | working (clocked in now)."""
    now = now or datetime.now(UAE)
    h = hours_on(st, b, day)
    if rec and rec.absent:
        return "absent"
    if on_leave:
        return "leave"
    if rec and rec.clock_in:
        cin = rec.clock_in.astimezone(UAE) if rec.clock_in.tzinfo else rec.clock_in.replace(tzinfo=UAE)
        late = bool(h and cin > datetime.combine(day, h[0], tzinfo=UAE) + timedelta(minutes=LATE_GRACE_MIN))
        if not rec.clock_out and day == now.date():
            return "late" if late else "working"
        return "late" if late else "present"
    if not h:
        return "off"
    start = datetime.combine(day, h[0], tzinfo=UAE)
    if day > now.date() or (day == now.date() and now < start + timedelta(minutes=LATE_GRACE_MIN)):
        return "upcoming"
    return "absent"


def worked_minutes(rec: Attendance | None, now: datetime | None = None) -> int:
    if not rec or not rec.clock_in or rec.absent:
        return 0
    now = now or datetime.now(UAE)
    end = rec.clock_out or (now if rec.day == now.date() else None)
    if not end:
        return 0
    return max(0, int((end - rec.clock_in).total_seconds() // 60))


# ---------------------------------------------------------------- commission
def _q(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def rate_for(st: Stylist, category: str | None) -> Decimal:
    by = {k.lower(): v for k, v in (st.commission_by_category or {}).items()}
    if category and category.lower() in by and by[category.lower()] is not None:
        return Decimal(str(by[category.lower()]))
    return Decimal(str(st.commission_rate or 0))


def split_by_category(menu: Menu, service: str, amount: Decimal) -> list[tuple[str, Decimal]]:
    """Shares an appointment's amount between its menu categories, in proportion to menu prices."""
    parts = menu.parts(service)
    weights: dict[str, Decimal] = {}
    for _, c in parts:
        cat = (c.category if c and c.category else "Other")
        weights[cat] = weights.get(cat, Decimal("0")) + (Decimal(str(c.unit_price)) if c and c.unit_price else Decimal("1"))
    if not weights:
        return [("Other", amount)]
    total = sum(weights.values())
    out, left = [], amount
    keys = list(weights)
    for k in keys[:-1]:
        share = _q(amount * weights[k] / total)
        out.append((k, share))
        left -= share
    out.append((keys[-1], left))
    return out


def net_of_vat(amount: Decimal, b: Business) -> Decimal:
    """Commission is worked out on the price before VAT (the VAT goes to the government)."""
    vat = Decimal(str(b.default_vat_rate or 0))
    return _q(amount / (1 + vat / 100)) if vat else _q(amount)
