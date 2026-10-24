from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import schemas as s
from ..db import get_db
from ..activity import UAE
from .. import whatsapp
from ..logic import appointment_out, quote_out, service_out
from .messages import message_out
from ..models import (
    Appointment,
    AppointmentStatus,
    CatalogItem,
    Customer,
    InventoryItem,
    OutboundMessage,
    Lead,
    LeadStatus,
    LinkClick,
    QRCode,
    Quote,
    QuoteStatus,
    ServiceRecord,
    Stylist,
    User,
)
from ..security import current_user
from ..utils import quote_totals

router = APIRouter(tags=["dashboard"])

DUE_WINDOW_DAYS = 30


@router.get("/dashboard", response_model=s.DashboardOut)
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    bid = user.business_id
    # One round trip for all three counts.
    today = datetime.now(UAE).date()
    day_start = datetime.combine(today, time.min, tzinfo=UAE)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    staff = db.scalar(select(func.count(Stylist.id)).where(Stylist.business_id == bid, Stylist.active.is_(True))) or 0
    leads, new_leads, services, customers, qrs, menu, upcoming, booked_ever, views_7d, taps_7d = db.execute(
        select(
            select(func.count(Lead.id)).where(Lead.business_id == bid).scalar_subquery(),
            select(func.count(Lead.id)).where(Lead.business_id == bid, Lead.status == LeadStatus.new).scalar_subquery(),
            select(func.count(ServiceRecord.id)).where(ServiceRecord.business_id == bid).scalar_subquery(),
            select(func.count(Customer.id)).where(Customer.business_id == bid).scalar_subquery(),
            select(func.count(QRCode.id)).where(QRCode.business_id == bid).scalar_subquery(),
            select(func.count(CatalogItem.id)).where(CatalogItem.business_id == bid).scalar_subquery(),
            select(func.count(Appointment.id)).where(
                Appointment.business_id == bid, Appointment.starts_at >= day_start,
                Appointment.starts_at < day_start + timedelta(days=7),
                Appointment.status.not_in((AppointmentStatus.cancelled, AppointmentStatus.no_show)),
            ).scalar_subquery(),
            select(func.count(Appointment.id)).where(Appointment.business_id == bid).scalar_subquery(),
            select(func.count(LinkClick.id)).where(LinkClick.business_id == bid, LinkClick.kind == "view", LinkClick.created_at >= week_ago).scalar_subquery(),
            select(func.count(LinkClick.id)).where(LinkClick.business_id == bid, LinkClick.kind != "view", LinkClick.created_at >= week_ago).scalar_subquery(),
        )
    ).one()
    todays = db.scalars(
        select(Appointment)
        .where(Appointment.business_id == bid, Appointment.starts_at >= day_start, Appointment.starts_at < day_start + timedelta(days=1))
        .options(joinedload(Appointment.customer), joinedload(Appointment.stylist))
        .order_by(Appointment.starts_at)
    ).unique().all()

    quotes = db.scalars(
        select(Quote).where(Quote.business_id == bid)
        .options(
            selectinload(Quote.items), selectinload(Quote.views), selectinload(Quote.customer),
            selectinload(Quote.business), selectinload(Quote.service_records), selectinload(Quote.appointments),
            selectinload(Quote.campaign),
        )
        .order_by(Quote.number.desc())
    ).all()
    accepted = [q for q in quotes if q.status == QuoteStatus.accepted]
    decided = [q for q in quotes if q.status in (QuoteStatus.accepted, QuoteStatus.rejected)]
    won = sum((quote_totals(q.items, q.discount, q.vat_rate).total for q in accepted), Decimal("0"))

    sources = db.execute(
        select(Lead.source, func.count()).where(Lead.business_id == bid).group_by(Lead.source).order_by(func.count().desc())
    ).all()

    due = db.scalars(
        select(ServiceRecord)
        .where(
            ServiceRecord.business_id == bid,
            ServiceRecord.next_service_date.is_not(None),
            ServiceRecord.next_service_date <= today + timedelta(days=DUE_WINDOW_DAYS),
        )
        .options(joinedload(ServiceRecord.customer))
        .order_by(ServiceRecord.next_service_date)
    ).all()

    return s.DashboardOut(
        leads=leads,
        new_leads=new_leads,
        quotes=len(quotes),
        open_quotes=sum(1 for q in quotes if q.status in (QuoteStatus.sent, QuoteStatus.viewed)),
        services=services,
        due_soon=len(due),
        won_value=won,
        acceptance_rate=round(len(accepted) / len(decided) * 100) if decided else None,
        sources=[s.SourceCount(source=src, leads=n) for src, n in sources],
        recent_quotes=[quote_out(db, q) for q in quotes[:5]],
        due_services=[service_out(r) for r in due[:8]],
        today=[appointment_out(a) for a in todays],
        upcoming=upcoming,
        link_views=user.business.link_views or 0,
        link_views_7d=views_7d,
        link_taps_7d=taps_7d,
        awaiting_booking=[quote_out(db, q) for q in quotes if q.booking_status == "awaiting" and q.status == QuoteStatus.accepted][:8],
        to_send=[message_out(m) for m in db.scalars(
            select(OutboundMessage).where(OutboundMessage.business_id == bid, OutboundMessage.status.in_(("manual", "failed"))).order_by(OutboundMessage.id)
        )][:10],
        low_stock=db.scalar(select(func.count(InventoryItem.id)).where(
            InventoryItem.business_id == bid, InventoryItem.low_stock > 0, InventoryItem.stock <= InventoryItem.low_stock)) or 0,
        whatsapp_auto=whatsapp.automatic(),
        # Getting-started checklist on the dashboard
        setup={
            "profile": bool((user.business.whatsapp or user.business.phone) and (user.business.tagline or user.business.address)),
            "menu": menu > 0,
            **({"link": bool(user.business.bio or user.business.instagram or user.business.tiktok)} if user.business.link_page_enabled else {"staff": staff > 0}),
            "booked": booked_ever > 0,
        },
    )
