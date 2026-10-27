"""Staff management: profiles, skills, working hours, logins and permissions, attendance, leave,
commission and performance. Staff logins also use /staff/me to see their day, clock in and ask for leave."""

import csv
import io
import secrets
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from .. import schemas as s
from .. import staff
from ..activity import UAE, record
from ..config import get_settings
from ..db import get_db
from ..logic import appointment_out, get_owned
from ..models import Appointment, AppointmentStatus, Attendance, Business, CatalogItem, LeaveRequest, Stylist, User
from ..security import current_user, hash_password, require_manager, require_owner
from ..utils import whatsapp_link
from .team import PALETTE

router = APIRouter(prefix="/staff", tags=["staff"])

GONE = (AppointmentStatus.cancelled, AppointmentStatus.no_show)
MAX_RANGE_DAYS = 93


def _today() -> date:
    return datetime.now(UAE).date()


def _bounds(first: date, last: date) -> tuple[datetime, datetime]:
    return datetime.combine(first, time.min, tzinfo=UAE), datetime.combine(last + timedelta(days=1), time.min, tzinfo=UAE)


def _range(start: date | None, end: date | None, default_days: int = 0) -> tuple[date, date]:
    first = start or _today().replace(day=1)
    last = end or (_today() if default_days == 0 else first + timedelta(days=default_days))
    if last < first:
        raise HTTPException(422, "The end date is before the start date.")
    if (last - first).days > MAX_RANGE_DAYS:
        raise HTTPException(422, "Ask for 3 months or less at a time.")
    return first, last


def _days(first: date, last: date):
    d = first
    while d <= last:
        yield d
        d += timedelta(days=1)


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _local_day(dt: datetime) -> date:
    return _aware(dt).astimezone(UAE).date()


# ---------------------------------------------------------------- profile
def _logins(db: Session, business_id: int) -> dict[int, User]:
    return {u.stylist_id: u for u in db.scalars(select(User).where(User.business_id == business_id, User.stylist_id.is_not(None)))}


def _staff_out(st: Stylist, b: Business, login: User | None, today: s.StaffToday | None = None) -> s.StaffOut:
    return s.StaffOut(
        id=st.id, name=st.name, role=st.role, color=st.color, on_page=st.on_page, active=st.active, position=st.position,
        phone=st.phone, email=st.email, joined_on=st.joined_on, notes=st.notes, skill_ids=list(st.skill_ids or []),
        working_hours=staff.week_hours(st, b), custom_hours=bool(st.working_hours),
        commission_rate=Decimal(str(st.commission_rate or 0)),
        commission_by_category={k: (Decimal(str(v)) if v is not None else None) for k, v in (st.commission_by_category or {}).items()},
        permissions=list(st.permissions or []), login_email=login.email if login else None,
        login_role=login.role if login else None, today=today,
    )


def _today_for(db: Session, b: Business, team: list[Stylist]) -> dict[int, s.StaffToday]:
    day = _today()
    recs = {r.stylist_id: r for r in db.scalars(select(Attendance).where(Attendance.business_id == b.id, Attendance.day == day))}
    leave = staff.on_leave_ids(db, b.id, day)
    lo, hi = _bounds(day, day)
    count: dict[int, int] = {}
    for sid, in db.execute(select(Appointment.stylist_id).where(
            Appointment.business_id == b.id, Appointment.starts_at >= lo, Appointment.starts_at < hi, Appointment.status.not_in(GONE))):
        if sid:
            count[sid] = count.get(sid, 0) + 1
    out = {}
    for st in team:
        h = staff.hours_on(st, b, day)
        r = recs.get(st.id)
        out[st.id] = s.StaffToday(status=staff.day_status(st, b, day, r, st.id in leave), hours=[f"{h[0]:%H:%M}", f"{h[1]:%H:%M}"] if h else None,
                                  clock_in=r.clock_in if r else None, clock_out=r.clock_out if r else None, appointments=count.get(st.id, 0))
    return out


def _categories(db: Session, business_id: int) -> list[str]:
    cats = db.scalars(select(CatalogItem.category).where(CatalogItem.business_id == business_id, CatalogItem.category.is_not(None)).distinct()).all()
    return sorted({c for c in cats if c})


@router.get("", response_model=s.StaffListOut)
def list_staff(user: User = Depends(require_manager), db: Session = Depends(get_db)):
    b = user.business
    team = db.scalars(select(Stylist).where(Stylist.business_id == b.id).order_by(Stylist.active.desc(), Stylist.position, Stylist.id)).all()
    logins, today = _logins(db, b.id), _today_for(db, b, [t for t in team if t.active])
    pending = db.scalar(select(func.count(LeaveRequest.id)).where(LeaveRequest.business_id == b.id, LeaveRequest.status == "pending")) or 0
    return s.StaffListOut(staff=[_staff_out(t, b, logins.get(t.id), today.get(t.id)) for t in team], pending_leave=pending,
                          permissions=staff.PERMISSIONS, categories=_categories(db, b.id))


@router.post("", response_model=s.StaffOut, status_code=201)
def add_staff(body: s.StaffIn, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    count = db.scalar(select(func.count(Stylist.id)).where(Stylist.business_id == user.business_id)) or 0
    st = Stylist(business_id=user.business_id, name=body.name.strip(), role=(body.role or "").strip() or None,
                 color=body.color or PALETTE[count % len(PALETTE)], on_page=body.on_page, position=count,
                 phone=body.phone, email=str(body.email) if body.email else None, joined_on=body.joined_on or _today(), notes=body.notes,
                 permissions=list(staff.DEFAULT_PERMISSIONS))
    db.add(st)
    record(db, user.business_id, "staff_added")
    db.commit()
    db.refresh(st)
    return _staff_out(st, user.business, None)


# ---------------------------------------------------------------- availability (diary picker)
@router.get("/availability", response_model=list[s.AvailabilityOut])
def availability(start: datetime, minutes: int = Query(default=60, ge=5, le=720), service: str = Query(default="", max_length=300),
                 ignore: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Who can take this booking, and why not for the others (day off, on leave, busy, doesn't do it)."""
    if not staff.can(user, "book"):
        raise HTTPException(403, "Your login doesn't include booking.")
    from .appointments import _clash

    b = user.business
    start = start.replace(tzinfo=UAE) if start.tzinfo is None else start
    day = start.astimezone(UAE).date()
    menu = staff.Menu.load(db, b.id)
    needs, leave = menu.needs(service), staff.on_leave_ids(db, b.id, day)
    out = []
    for st in db.scalars(select(Stylist).where(Stylist.business_id == b.id, Stylist.active.is_(True)).order_by(Stylist.position, Stylist.id)):
        why = staff.why_not(st, b, start, minutes, needs, leave, menu)
        if not why:
            other = _clash(db, b.id, st.id, start, minutes, ignore_id=ignore)
            if other:
                why = f"Busy with {other.customer.name.split()[0]} ({other.service[:30]})"
        out.append(s.AvailabilityOut(stylist_id=st.id, name=st.name, color=st.color, ok=why is None, reason=why))
    return out


# ---------------------------------------------------------------- attendance
def _attendance(db: Session, b: Business, first: date, last: date, team: list[Stylist]) -> list[s.AttendanceRow]:
    ids = [t.id for t in team]
    recs = {(r.stylist_id, r.day): r for r in db.scalars(select(Attendance).where(
        Attendance.business_id == b.id, Attendance.day >= first, Attendance.day <= last, Attendance.stylist_id.in_(ids or [-1])))}
    leave = {(lv.stylist_id, d) for lv in staff.leave_on(db, b.id, first, last) for d in _days(max(first, lv.start_date), min(last, lv.end_date))}
    now = datetime.now(UAE)
    rows = []
    for st in team:
        days, mins, late, absent, lv = [], 0, 0, 0, 0
        for d in _days(first, last):
            r = recs.get((st.id, d))
            stt = staff.day_status(st, b, d, r, (st.id, d) in leave, now)
            h = staff.hours_on(st, b, d)
            m = staff.worked_minutes(r, now)
            mins += m
            late += stt == "late"
            absent += stt == "absent"
            lv += stt == "leave"
            days.append(s.AttendanceDay(day=d, status=stt, clock_in=r.clock_in if r else None, clock_out=r.clock_out if r else None,
                                        minutes=m, note=r.note if r else None, edited=bool(r and r.edited),
                                        hours=[f"{h[0]:%H:%M}", f"{h[1]:%H:%M}"] if h else None))
        rows.append(s.AttendanceRow(stylist_id=st.id, name=st.name, color=st.color, days=days, worked_minutes=mins, late=late, absent=absent, leave=lv))
    return rows


@router.get("/attendance", response_model=list[s.AttendanceRow])
def attendance(start: date | None = None, end: date | None = None, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    first = start or _today() - timedelta(days=_today().weekday())
    last = end or first + timedelta(days=6)
    first, last = _range(first, last)
    team = db.scalars(select(Stylist).where(Stylist.business_id == user.business_id, Stylist.active.is_(True)).order_by(Stylist.position, Stylist.id)).all()
    return _attendance(db, user.business, first, last, team)


@router.put("/{sid}/attendance/{day}", response_model=s.AttendanceDay)
def fix_attendance(sid: int, day: date, body: s.AttendanceFixIn, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    """The owner corrects a day: clock-in/out times, or marks it absent."""
    st = get_owned(db, Stylist, sid, user.business_id, "Staff member")
    if day > _today():
        raise HTTPException(422, "You can't fill in attendance for a day that hasn't happened yet.")
    r = db.scalar(select(Attendance).where(Attendance.stylist_id == st.id, Attendance.day == day))
    if not r:
        r = Attendance(business_id=user.business_id, stylist_id=st.id, day=day)
        db.add(r)

    def at(hhmm: str | None) -> datetime | None:
        if not hhmm:
            return None
        h, m = hhmm.split(":")
        return datetime.combine(day, time(int(h), int(m)), tzinfo=UAE)

    r.absent = body.absent
    r.clock_in, r.clock_out = (None, None) if body.absent else (at(body.clock_in), at(body.clock_out))
    if r.clock_in and r.clock_out and r.clock_out <= r.clock_in:
        raise HTTPException(422, "Clock-out must be after clock-in.")
    if r.clock_out and not r.clock_in:
        raise HTTPException(422, "Add the clock-in time too.")
    r.note, r.edited = body.note, True
    db.commit()
    rows = _attendance(db, user.business, day, day, [st])
    return rows[0].days[0]


# ---------------------------------------------------------------- leave
def _leave_out(db: Session, lv: LeaveRequest) -> s.LeaveOut:
    lo, hi = _bounds(lv.start_date, lv.end_date)
    clashes = db.scalar(select(func.count(Appointment.id)).where(
        Appointment.stylist_id == lv.stylist_id, Appointment.starts_at >= lo, Appointment.starts_at < hi,
        Appointment.status.in_((AppointmentStatus.booked, AppointmentStatus.confirmed)))) or 0
    return s.LeaveOut(id=lv.id, stylist_id=lv.stylist_id, name=lv.stylist.name, color=lv.stylist.color, kind=lv.kind,
                      start_date=lv.start_date, end_date=lv.end_date, days=(lv.end_date - lv.start_date).days + 1, reason=lv.reason,
                      status=lv.status, reply=lv.reply, created_at=lv.created_at, decided_at=lv.decided_at,
                      clashes=clashes if lv.status in ("pending", "approved") else 0)


def _check_leave_dates(body: s.LeaveIn) -> None:
    if body.end_date < body.start_date:
        raise HTTPException(422, "The last day is before the first day.")
    if (body.end_date - body.start_date).days > 90:
        raise HTTPException(422, "Leave can be up to 90 days at a time.")


@router.get("/leave", response_model=list[s.LeaveOut])
def list_leave(status: str | None = Query(default=None, pattern="^(pending|approved|rejected|cancelled)$"),
               user: User = Depends(require_manager), db: Session = Depends(get_db)):
    stmt = (select(LeaveRequest).where(LeaveRequest.business_id == user.business_id).options(joinedload(LeaveRequest.stylist))
            .order_by((LeaveRequest.status == "pending").desc(), LeaveRequest.start_date.desc()).limit(200))
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    return [_leave_out(db, lv) for lv in db.scalars(stmt)]


@router.post("/leave", response_model=s.LeaveOut, status_code=201)
def add_leave(body: s.LeaveIn, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    """The owner records leave for someone (approved straight away)."""
    _check_leave_dates(body)
    if not body.stylist_id:
        raise HTTPException(422, "Choose who the leave is for.")
    st = get_owned(db, Stylist, body.stylist_id, user.business_id, "Staff member")
    lv = LeaveRequest(business_id=user.business_id, stylist_id=st.id, kind=body.kind, start_date=body.start_date, end_date=body.end_date,
                      reason=body.reason, status="approved", decided_at=datetime.now(timezone.utc))
    db.add(lv)
    db.commit()
    db.refresh(lv)
    return _leave_out(db, lv)


@router.post("/leave/{lid}/decide", response_model=s.LeaveOut)
def decide_leave(lid: int, body: s.LeaveDecisionIn, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    lv = get_owned(db, LeaveRequest, lid, user.business_id, "Leave request")
    if lv.status not in ("pending", "approved"):
        raise HTTPException(409, "This request was already closed.")
    lv.status = "approved" if body.approve else "rejected"
    lv.reply = body.reply
    lv.decided_at = datetime.now(timezone.utc)
    record(db, user.business_id, f"leave_{lv.status}")
    db.commit()
    return _leave_out(db, lv)


# ---------------------------------------------------------------- commission
def commission(db: Session, b: Business, first: date, last: date, only: int | None = None) -> s.CommissionOut:
    """Commission on finished appointments in the period: each one's price before VAT, split by menu category,
    times that person's rate for the category (or their default rate)."""
    lo, hi = _bounds(first, last)
    menu = staff.Menu.load(db, b.id)
    team = {t.id: t for t in db.scalars(select(Stylist).where(Stylist.business_id == b.id))}
    stmt = select(Appointment).where(Appointment.business_id == b.id, Appointment.status == AppointmentStatus.completed,
                                     Appointment.starts_at >= lo, Appointment.starts_at < hi)
    if only is not None:
        stmt = stmt.where(Appointment.stylist_id == only)
    agg: dict[int, dict] = {}
    unassigned = Decimal("0")
    for a in db.scalars(stmt):
        price = Decimal(str(a.price or 0))
        if not a.stylist_id or a.stylist_id not in team:
            unassigned += price
            continue
        st = team[a.stylist_id]
        row = agg.setdefault(st.id, {"services": 0, "sales": Decimal("0"), "lines": {}})
        row["services"] += 1
        row["sales"] += price
        for cat, share in staff.split_by_category(menu, a.service, staff.net_of_vat(price, b)):
            row["lines"][cat] = row["lines"].get(cat, Decimal("0")) + share
    rows = []
    for sid, row in agg.items():
        st = team[sid]
        lines = []
        for cat, net in sorted(row["lines"].items(), key=lambda kv: -kv[1]):
            rate = staff.rate_for(st, cat)
            lines.append(s.CommissionLine(category=cat, sales=staff._q(net), rate=rate, commission=staff._q(net * rate / 100)))
        rows.append(s.CommissionRow(stylist_id=sid, name=st.name, color=st.color, services=row["services"], sales=staff._q(row["sales"]),
                                    net_sales=staff._q(sum((ln.sales for ln in lines), Decimal("0"))),
                                    commission=staff._q(sum((ln.commission for ln in lines), Decimal("0"))), lines=lines))
    if only is None:  # everyone on the team appears, even with no sales yet
        for st in team.values():
            if st.active and st.id not in agg:
                rows.append(s.CommissionRow(stylist_id=st.id, name=st.name, color=st.color, services=0, sales=Decimal("0"),
                                            net_sales=Decimal("0"), commission=Decimal("0"), lines=[]))
    rows.sort(key=lambda r: (-r.commission, -r.sales, r.name))
    return s.CommissionOut(start=first, end=last, rows=rows, total_sales=staff._q(sum((r.sales for r in rows), Decimal("0"))),
                           total_commission=staff._q(sum((r.commission for r in rows), Decimal("0"))),
                           vat_rate=Decimal(str(b.default_vat_rate or 0)), unassigned_sales=staff._q(unassigned))


@router.get("/commission", response_model=s.CommissionOut)
def get_commission(start: date | None = None, end: date | None = None, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    first, last = _range(start, end)
    return commission(db, user.business, first, last)


@router.get("/commission.csv")
def commission_csv(start: date | None = None, end: date | None = None, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    first, last = _range(start, end)
    c = commission(db, user.business, first, last)
    cur = user.business.currency
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Staff", "Category", "Services", f"Sales with VAT ({cur})", f"Sales before VAT ({cur})", "Rate %", f"Commission ({cur})"])
    for r in c.rows:
        for ln in r.lines:
            w.writerow([r.name, ln.category, "", "", ln.sales, ln.rate, ln.commission])
        w.writerow([r.name, "TOTAL", r.services, r.sales, r.net_sales, "", r.commission])
    w.writerow(["All staff", "TOTAL", "", c.total_sales, "", "", c.total_commission])
    name = f"commission-{first:%Y-%m-%d}-to-{last:%Y-%m-%d}.csv"
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- performance
@router.get("/report", response_model=s.PerformanceOut)
def report(start: date | None = None, end: date | None = None, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    b = user.business
    first, last = _range(start, end)
    lo, hi = _bounds(first, last)
    team = db.scalars(select(Stylist).where(Stylist.business_id == b.id, Stylist.active.is_(True)).order_by(Stylist.position, Stylist.id)).all()
    appts = db.scalars(select(Appointment).where(Appointment.business_id == b.id, Appointment.starts_at >= lo, Appointment.starts_at < hi,
                                                 Appointment.stylist_id.is_not(None))).all()
    # clients each person had served before this period, for "returning clients"
    before = {(sid, cid) for sid, cid in db.execute(select(Appointment.stylist_id, Appointment.customer_id).where(
        Appointment.business_id == b.id, Appointment.status == AppointmentStatus.completed, Appointment.starts_at < lo))}
    com = {r.stylist_id: r.commission for r in commission(db, b, first, last).rows}
    att = {r.stylist_id: r for r in _attendance(db, b, first, min(last, _today()), team)} if first <= _today() else {}
    leave = {(lv.stylist_id, d) for lv in staff.leave_on(db, b.id, first, last) for d in _days(max(first, lv.start_date), min(last, lv.end_date))}
    rows = []
    for st in team:
        mine = [a for a in appts if a.stylist_id == st.id]
        done = [a for a in mine if a.status == AppointmentStatus.completed]
        live = [a for a in mine if a.status not in GONE]
        sales = sum((Decimal(str(a.price or 0)) for a in done), Decimal("0"))
        clients = {a.customer_id for a in done}
        sched = 0
        for d in _days(first, last):
            h = staff.hours_on(st, b, d)
            if h and (st.id, d) not in leave:
                sched += (datetime.combine(d, h[1]) - datetime.combine(d, h[0])).seconds // 60
        booked = sum(a.duration_min for a in live)
        a_row = att.get(st.id)
        rows.append(s.PerformanceRow(
            stylist_id=st.id, name=st.name, color=st.color, booked=len(mine), completed=len(done),
            no_shows=sum(a.status == AppointmentStatus.no_show for a in mine), cancelled=sum(a.status == AppointmentStatus.cancelled for a in mine),
            sales=staff._q(sales), avg_ticket=staff._q(sales / len(done)) if done else Decimal("0"), commission=com.get(st.id, Decimal("0")),
            clients=len(clients), repeat_clients=sum((st.id, c) in before for c in clients),
            booked_hours=round(booked / 60, 1), scheduled_hours=round(sched / 60, 1), utilisation=round(100 * booked / sched) if sched else 0,
            worked_hours=round((a_row.worked_minutes if a_row else 0) / 60, 1), late=a_row.late if a_row else 0,
            absent=a_row.absent if a_row else 0, leave_days=sum(1 for d in _days(first, last) if (st.id, d) in leave and staff.hours_on(st, b, d)),
        ))
    rows.sort(key=lambda r: -r.sales)
    return s.PerformanceOut(start=first, end=last, rows=rows)


# ---------------------------------------------------------------- the staff member's own day
def _me(user: User) -> Stylist:
    if not user.stylist or not user.stylist.active:
        raise HTTPException(404, "This login isn't linked to a staff profile.")
    return user.stylist


@router.get("/me", response_model=s.MyDayOut)
def my_day(user: User = Depends(current_user), db: Session = Depends(get_db)):
    st, b = _me(user), user.business
    lo, hi = _bounds(_today(), _today())
    appts = db.scalars(select(Appointment).where(Appointment.stylist_id == st.id, Appointment.starts_at >= lo, Appointment.starts_at < hi)
                       .options(joinedload(Appointment.customer), joinedload(Appointment.stylist)).order_by(Appointment.starts_at)).all()
    outs = []
    for a in appts:
        o = appointment_out(a)
        if not staff.can(user, "phones"):
            o.customer.phone = o.customer.email = None
        outs.append(o)
    leave = db.scalars(select(LeaveRequest).where(LeaveRequest.stylist_id == st.id).options(joinedload(LeaveRequest.stylist))
                       .order_by(LeaveRequest.start_date.desc()).limit(20)).all()
    earn = commission(db, b, _today().replace(day=1), _today(), only=st.id) if staff.can(user, "earnings") else None
    return s.MyDayOut(staff=_staff_out(st, b, user), today=_today_for(db, b, [st])[st.id], appointments=outs,
                      leave=[_leave_out(db, lv) for lv in leave], earnings=earn, week=staff.week_hours(st, b))


@router.post("/me/clock", response_model=s.StaffToday)
def clock(body: s.ClockIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    st, day = _me(user), _today()
    r = db.scalar(select(Attendance).where(Attendance.stylist_id == st.id, Attendance.day == day))
    now = datetime.now(timezone.utc)
    if body.action == "in":
        if r and r.clock_in and not r.clock_out:
            raise HTTPException(409, "You're already clocked in.")
        if r and r.clock_out:
            raise HTTPException(409, "You already clocked out today. Ask the owner to correct it if needed.")
        if not r:
            r = Attendance(business_id=st.business_id, stylist_id=st.id, day=day)
            db.add(r)
        r.clock_in, r.absent = now, False
    else:
        if not r or not r.clock_in:
            raise HTTPException(409, "Clock in first.")
        if r.clock_out:
            raise HTTPException(409, "You already clocked out today.")
        r.clock_out = now
    db.commit()
    return _today_for(db, user.business, [st])[st.id]


@router.post("/me/leave", response_model=s.LeaveOut, status_code=201)
def request_leave(body: s.LeaveIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    st = _me(user)
    _check_leave_dates(body)
    if body.start_date < _today() and body.kind != "sick":
        raise HTTPException(422, "Leave can't start in the past (except sick leave).")
    lv = LeaveRequest(business_id=st.business_id, stylist_id=st.id, kind=body.kind, start_date=body.start_date, end_date=body.end_date,
                      reason=body.reason, status="pending")
    db.add(lv)
    record(db, st.business_id, "leave_requested")
    db.commit()
    db.refresh(lv)
    return _leave_out(db, lv)


@router.delete("/me/leave/{lid}", status_code=204)
def cancel_leave(lid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    st = _me(user)
    lv = get_owned(db, LeaveRequest, lid, st.business_id, "Leave request")
    if lv.stylist_id != st.id:
        raise HTTPException(404, "Leave request not found")
    if lv.status != "pending":
        raise HTTPException(409, "Only requests still waiting can be cancelled. Ask the owner.")
    lv.status = "cancelled"
    db.commit()


# ---------------------------------------------------------------- one staff member (owner/manager)
@router.get("/{sid}", response_model=s.StaffOut)
def get_staff(sid: int, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    st = get_owned(db, Stylist, sid, user.business_id, "Staff member")
    today = _today_for(db, user.business, [st]).get(st.id) if st.active else None
    return _staff_out(st, user.business, _logins(db, user.business_id).get(st.id), today)


@router.patch("/{sid}", response_model=s.StaffOut)
def update_staff(sid: int, body: s.StaffUpdate, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    st = get_owned(db, Stylist, sid, user.business_id, "Staff member")
    changes = body.model_dump(exclude_unset=True)
    if {"commission_rate", "commission_by_category"} & set(changes) and staff.role(user) != "owner":
        raise HTTPException(403, "Only the owner can change commission.")
    if "skill_ids" in changes:
        own = set(db.scalars(select(CatalogItem.id).where(CatalogItem.business_id == user.business_id)))
        changes["skill_ids"] = sorted({i for i in changes["skill_ids"] or [] if i in own})
    if "working_hours" in changes:
        wh = {}
        for k, v in (changes["working_hours"] or {}).items():
            if k not in {str(d) for d in range(7)}:
                raise HTTPException(422, "Working hours use days 0 (Mon) to 6 (Sun).")
            if v:
                a, z = staff._hm(v[0] if len(v) > 0 else None), staff._hm(v[1] if len(v) > 1 else None)
                if not a or not z or z <= a:
                    raise HTTPException(422, f"Check the hours for {staff.DAYS[int(k)]}: the finish must be after the start.")
                wh[k] = [f"{a:%H:%M}", f"{z:%H:%M}"]
            else:
                wh[k] = None
        changes["working_hours"] = wh
    if "commission_by_category" in changes:
        changes["commission_by_category"] = {k.strip()[:60]: (float(v) if v is not None else None)
                                             for k, v in (changes["commission_by_category"] or {}).items()
                                             if k.strip() and (v is None or 0 <= v <= 100)}
    if "email" in changes and changes["email"] is not None:
        changes["email"] = str(changes["email"])
    for k, v in changes.items():
        if isinstance(v, str):
            v = v.strip() or (None if k != "name" else v)
        setattr(st, k, v)
    if changes.get("active") is False:
        st.on_page = False
    db.commit()
    db.refresh(st)
    return get_staff(sid, user, db)


@router.delete("/{sid}", status_code=204)
def remove_staff(sid: int, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    """Leaves the team: past work stays in the reports, their login stops working, and they can't be booked."""
    st = get_owned(db, Stylist, sid, user.business_id, "Staff member")
    st.active, st.on_page = False, False
    db.commit()


def _temp_password() -> str:
    words = ["rose", "mint", "palm", "sand", "pearl", "amber", "cedar", "coral", "jade", "lime"]
    return f"{secrets.choice(words)}-{secrets.randbelow(9000) + 1000}-{secrets.choice(words)}"


@router.put("/{sid}/login", response_model=s.StaffLoginOut)
def give_login(sid: int, body: s.StaffAccessIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Creates (or resets) this person's login and returns a one-time password to share with them."""
    st = get_owned(db, Stylist, sid, user.business_id, "Staff member")
    if not st.active:
        raise HTTPException(409, f"{st.name} is no longer on the team.")
    email = str(body.email).lower()
    taken = db.scalar(select(User).where(func.lower(User.email) == email))
    login = db.scalar(select(User).where(User.stylist_id == st.id))
    if taken and (not login or taken.id != login.id):
        raise HTTPException(409, "That email already has a login. Use another email for this person.")
    password = _temp_password()
    if not login:
        login = User(business_id=user.business_id, email=email, name=st.name, password_hash=hash_password(password), role=body.role, stylist_id=st.id)
        db.add(login)
    else:
        login.email, login.role, login.password_hash = email, body.role, hash_password(password)
    st.email = st.email or email
    record(db, user.business_id, "staff_login_given")
    db.commit()
    url = f"{get_settings().app_url.rstrip('/')}/login"
    msg = (f"Hi {st.name.split()[0]}, here is your {user.business.name} login for {get_settings().brand_name}: {url}\n"
           f"Email: {email}\nPassword: {password}\nYou can change the password after you sign in.")
    return s.StaffLoginOut(email=email, role=body.role, password=password, login_url=url, whatsapp_url=whatsapp_link(st.phone, msg))


@router.delete("/{sid}/login", status_code=204)
def remove_login(sid: int, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    st = get_owned(db, Stylist, sid, user.business_id, "Staff member")
    login = db.scalar(select(User).where(User.stylist_id == st.id))
    if login:
        db.delete(login)
        db.commit()


@router.put("/{sid}/permissions", response_model=s.StaffOut)
def set_permissions(sid: int, body: s.StaffPermissionsIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    st = get_owned(db, Stylist, sid, user.business_id, "Staff member")
    st.permissions = [p for p in staff.PERMISSIONS if p in set(body.permissions)]
    db.commit()
    return get_staff(sid, user, db)
