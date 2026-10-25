"""Database models.

Everything a business owns carries business_id, and every authenticated query
filters on it. Customers are the spine: leads, quotes and service records all
point at one customer row, which is what links Acquire -> Quote -> Serve -> Retain.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


Money = Numeric(12, 2)


class LeadStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    quoted = "quoted"
    won = "won"
    lost = "lost"


class QuoteStatus(str, enum.Enum):
    sent = "sent"
    viewed = "viewed"
    accepted = "accepted"
    rejected = "rejected"


class QRDestination(str, enum.Enum):
    whatsapp = "whatsapp"  # scan goes straight to a WhatsApp chat
    landing = "landing"  # scan opens the business page (WhatsApp / call / enquiry form)


class AppointmentStatus(str, enum.Enum):
    booked = "booked"  # in the diary, not yet confirmed with the client
    confirmed = "confirmed"  # client confirmed (owner sent the WhatsApp confirmation)
    arrived = "arrived"  # client is in the chair
    completed = "completed"  # done; a visit record exists
    no_show = "no_show"
    cancelled = "cancelled"


class QREventKind(str, enum.Enum):
    scan = "scan"
    whatsapp = "whatsapp"
    call = "call"
    enquiry = "enquiry"


def _enum(e):
    return Enum(e, native_enum=False, length=20, validate_strings=True)


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(40))
    whatsapp: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(200))
    tagline: Mapped[str | None] = mapped_column(String(240))
    address: Mapped[str | None] = mapped_column(String(300))
    trn: Mapped[str | None] = mapped_column(String(30))  # UAE VAT Tax Registration Number
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    default_vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("5.00"))
    next_quote_number: Mapped[int] = mapped_column(Integer, default=1001)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # --- link-in-bio page (/{slug}) for Instagram, TikTok, Snapchat... ---
    slug: Mapped[str | None] = mapped_column(String(40), unique=True, index=True)
    bio: Mapped[str | None] = mapped_column(String(300))
    instagram: Mapped[str | None] = mapped_column(String(120))
    tiktok: Mapped[str | None] = mapped_column(String(120))
    snapchat: Mapped[str | None] = mapped_column(String(120))
    facebook: Mapped[str | None] = mapped_column(String(200))
    maps_url: Mapped[str | None] = mapped_column(String(500))
    hours: Mapped[str | None] = mapped_column(String(200))  # "Daily 10am – 10pm · Fri from 2pm"
    link_theme: Mapped[str] = mapped_column(String(20), default="clay", server_default="clay")
    link_motion: Mapped[str] = mapped_column(String(20), default="bloom", server_default="bloom")
    link_show_prices: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    link_booking: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    link_views: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Off until the platform admin switches it on for this salon.
    link_page_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # --- opening hours, used to offer free slots to clients who accept a quote ---
    open_time: Mapped[str] = mapped_column(String(5), default="10:00", server_default="10:00")
    close_time: Mapped[str] = mapped_column(String(5), default="22:00", server_default="22:00")
    closed_days: Mapped[str] = mapped_column(String(20), default="", server_default="")  # "4" = Friday (Mon=0)
    # --- account management (set by the platform admin) ---
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")  # active | suspended
    plan: Mapped[str | None] = mapped_column(String(60))
    plan_amount: Mapped[Decimal | None] = mapped_column(Money)  # per month
    trial_ends_at: Mapped[date | None] = mapped_column(Date)
    paid_until: Mapped[date | None] = mapped_column(Date)
    admin_note: Mapped[str | None] = mapped_column(Text)
    invite_code_id: Mapped[int | None] = mapped_column(ForeignKey("invite_codes.id", ondelete="SET NULL"))
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # --- self-serve sign-up ---
    business_type: Mapped[str] = mapped_column(String(30), default="unisex", server_default="unisex")
    signup_source: Mapped[str | None] = mapped_column(String(120))  # utm_source / referrer, e.g. "google"
    signup_campaign: Mapped[str | None] = mapped_column(String(160))  # utm_campaign
    checklist_hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    users: Mapped[list[User]] = relationship(back_populates="business")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Ids of the first-time tips this person has dismissed, comma-separated.
    seen_tips: Mapped[str] = mapped_column(Text, default="", server_default="")

    business: Mapped[Business] = relationship(back_populates="users")


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(40), index=True)
    email: Mapped[str | None] = mapped_column(String(200))
    area: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    leads: Mapped[list[Lead]] = relationship(back_populates="customer")
    quotes: Mapped[list[Quote]] = relationship(back_populates="customer")
    services: Mapped[list[ServiceRecord]] = relationship(back_populates="customer")


class QRCode(Base):
    __tablename__ = "qr_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))  # the source label, e.g. "Instagram"
    campaign: Mapped[str | None] = mapped_column(String(120))
    destination: Mapped[QRDestination] = mapped_column(_enum(QRDestination), default=QRDestination.landing)
    scans: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    events: Mapped[list[QREvent]] = relationship(back_populates="qr", cascade="all, delete-orphan")


class QREvent(Base):
    __tablename__ = "qr_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    qr_id: Mapped[int] = mapped_column(ForeignKey("qr_codes.id", ondelete="CASCADE"), index=True)
    kind: Mapped[QREventKind] = mapped_column(_enum(QREventKind))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    qr: Mapped[QRCode] = relationship(back_populates="events")


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    qr_id: Mapped[int | None] = mapped_column(ForeignKey("qr_codes.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(String(80))  # QR name, or "Walk-in", "Phone call"...
    requirement: Mapped[str | None] = mapped_column(Text)
    # Booking request details (from the link page or the QR enquiry form)
    service_interest: Mapped[str | None] = mapped_column(String(300))
    preferred_date: Mapped[date | None] = mapped_column(Date)
    preferred_time: Mapped[str | None] = mapped_column(String(40))  # "Morning", "After 6pm", "14:30"
    stylist_pref: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[LeadStatus] = mapped_column(_enum(LeadStatus), default=LeadStatus.new, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    customer: Mapped[Customer] = relationship(back_populates="leads")


class Quote(Base):
    __tablename__ = "quotes"
    __table_args__ = (UniqueConstraint("business_id", "number", name="uq_quote_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"))
    number: Mapped[int] = mapped_column(Integer)  # shown as Q-1024
    token: Mapped[str] = mapped_column(String(24), unique=True, index=True)  # public link id
    discount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("5.00"))
    valid_days: Mapped[int] = mapped_column(Integer, default=7)
    notes: Mapped[str | None] = mapped_column(Text)
    # What the job is about: the car and plate, the AC location/unit, the property…
    reference: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[QuoteStatus] = mapped_column(_enum(QuoteStatus), default=QuoteStatus.sent, index=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # direct = written for one client (or many, as a bulk send); campaign = a client accepted a campaign offer
    kind: Mapped[str] = mapped_column(String(20), default="direct", server_default="direct")
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("campaigns.id", ondelete="SET NULL"), index=True)
    # After acceptance: None = not accepted yet, "awaiting" = accepted, waiting for a booking, "confirmed" = booked
    booking_status: Mapped[str | None] = mapped_column(String(20))
    # First time the owner sent it (WhatsApp, copy link, PDF). Until then it is "Ready to send".
    shared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    customer: Mapped[Customer] = relationship(back_populates="quotes")
    business: Mapped[Business] = relationship()
    items: Mapped[list[QuoteItem]] = relationship(
        back_populates="quote", cascade="all, delete-orphan", order_by="QuoteItem.position"
    )
    views: Mapped[list[QuoteView]] = relationship(
        back_populates="quote", cascade="all, delete-orphan", order_by="QuoteView.viewed_at"
    )
    # Read-only link used to show "Serviced" without one query per quote.
    service_records: Mapped[list[ServiceRecord]] = relationship(viewonly=True, order_by="ServiceRecord.id")
    campaign: Mapped[Campaign | None] = relationship(viewonly=True)
    appointments: Mapped[list[Appointment]] = relationship(viewonly=True, order_by="Appointment.starts_at")
    wa_messages: Mapped[list["OutboundMessage"]] = relationship(
        viewonly=True, order_by="OutboundMessage.id", primaryjoin="and_(Quote.id == foreign(OutboundMessage.quote_id), OutboundMessage.kind == 'quote')")


class QuoteItem(Base):
    __tablename__ = "quote_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[int] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(300))
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1"))
    unit_price: Mapped[Decimal] = mapped_column(Money)

    quote: Mapped[Quote] = relationship(back_populates="items")


class QuoteView(Base):
    __tablename__ = "quote_views"

    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[int] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), index=True)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    client_hash: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))

    quote: Mapped[Quote] = relationship(back_populates="views")


class ServiceRecord(Base):
    __tablename__ = "service_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    quote_id: Mapped[int | None] = mapped_column(ForeignKey("quotes.id", ondelete="SET NULL"))
    token: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    service: Mapped[str] = mapped_column(String(300))
    service_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    technician: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(String(200))
    next_service_date: Mapped[date | None] = mapped_column(Date, index=True)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    customer: Mapped[Customer] = relationship(back_populates="services")
    business: Mapped[Business] = relationship()


class CatalogItem(Base):
    """The salon's service menu: "Haircut & blow-dry", "Gel manicure"… Used on quotes,
    appointments and the public link page."""

    __tablename__ = "catalog_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(300))
    unit_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    category: Mapped[str | None] = mapped_column(String(60))  # Hair, Nails, Skin, Grooming, Bridal…
    duration_min: Mapped[int | None] = mapped_column(Integer)
    price_from: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # show "from AED 80"
    on_page: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")  # listed on the link page
    uses: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LinkItem(Base):
    """An extra button on the link page: "Bridal lookbook", "Gift vouchers", "Our TikTok"…"""

    __tablename__ = "link_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    url: Mapped[str] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=0)
    highlight: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    clicks: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LinkClick(Base):
    """One tap on the link page (social icon, WhatsApp, a custom link), for the stats."""

    __tablename__ = "link_clicks"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # view | whatsapp | call | instagram | tiktok | maps | link | book
    link_id: Mapped[int | None] = mapped_column(ForeignKey("link_items.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Stylist(Base):
    """A team member clients can book: stylist, barber, nail tech, therapist."""

    __tablename__ = "stylists"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str | None] = mapped_column(String(80))  # "Senior stylist", "Barber", "Nail artist"
    color: Mapped[str] = mapped_column(String(9), default="#b4532f")
    on_page: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Appointment(Base):
    """A booked job in the diary. Completing it creates the visit record (ServiceRecord)."""

    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    stylist_id: Mapped[int | None] = mapped_column(ForeignKey("stylists.id", ondelete="SET NULL"), index=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"))
    quote_id: Mapped[int | None] = mapped_column(ForeignKey("quotes.id", ondelete="SET NULL"))
    service_record_id: Mapped[int | None] = mapped_column(ForeignKey("service_records.id", ondelete="SET NULL"))
    token: Mapped[str] = mapped_column(String(24), unique=True, index=True)  # client's confirmation link
    service: Mapped[str] = mapped_column(String(300))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    location: Mapped[str] = mapped_column(String(20), default="salon", server_default="salon")  # salon | home
    address: Mapped[str | None] = mapped_column(String(300))  # for home visits
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AppointmentStatus] = mapped_column(_enum(AppointmentStatus), default=AppointmentStatus.booked, index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    customer: Mapped[Customer] = relationship()
    stylist: Mapped[Stylist | None] = relationship()
    business: Mapped[Business] = relationship()


class Campaign(Base):
    """A public offer for social media and ads ("Bridal package, AED 1,500, until 30 Nov").
    Anyone can open it, accept with their name and mobile, and book a time. Each acceptance
    becomes that client's own accepted quote."""

    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    discount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("5.00"))
    valid_until: Mapped[date | None] = mapped_column(Date)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    notes: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    views: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # The banner: classic | bold | soft | photo (AI background in campaign_art), and the shuffle seed.
    design_style: Mapped[str] = mapped_column(String(20), default="classic", server_default="classic")
    design_seed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    art_id: Mapped[int | None] = mapped_column(ForeignKey("campaign_art.id", ondelete="SET NULL", use_alter=True, name="fk_campaigns_art_id"))

    business: Mapped[Business] = relationship()
    items: Mapped[list[CampaignItem]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan", order_by="CampaignItem.position"
    )


class CampaignArt(Base):
    """An AI-generated background picture for a campaign banner (kept, so it's paid for once)."""

    __tablename__ = "campaign_art"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE", use_alter=True, name="fk_campaign_art_campaign_id"), index=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    prompt: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CampaignItem(Base):
    __tablename__ = "campaign_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(300))
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1"))
    unit_price: Mapped[Decimal] = mapped_column(Money)

    campaign: Mapped[Campaign] = relationship(back_populates="items")


class InventoryItem(Base):
    """A product the salon stocks: colour tubes, shampoo for resale, wax, gloves…"""

    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(60))
    sku: Mapped[str | None] = mapped_column(String(60))
    unit: Mapped[str] = mapped_column(String(20), default="pcs", server_default="pcs")
    stock: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    low_stock: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    cost_price: Mapped[Decimal | None] = mapped_column(Money)
    sell_price: Mapped[Decimal | None] = mapped_column(Money)  # set for retail products
    supplier: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class StockMove(Base):
    __tablename__ = "stock_moves"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("inventory_items.id", ondelete="CASCADE"), index=True)
    change: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    reason: Mapped[str] = mapped_column(String(20))  # received | used | sold | adjust
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class OutboundMessage(Base):
    """WhatsApp messages the system sent (or couldn't, and left for the owner to send)."""

    __tablename__ = "outbound_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"))
    to_phone: Mapped[str | None] = mapped_column(String(40))
    to_name: Mapped[str | None] = mapped_column(String(160))
    quote_id: Mapped[int | None] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"))
    wa_message_id: Mapped[str | None] = mapped_column(String(120), index=True)  # Meta's id, for delivered/read updates
    kind: Mapped[str] = mapped_column(String(30))  # booking_confirmed | quote | bot
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), index=True)  # sent | failed | manual | done
    error: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SocialAccount(Base):
    """A salon's Facebook Page, Instagram account or YouTube channel that campaigns can be posted to.
    Tokens are encrypted (see social.py)."""

    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("business_id", "provider", "account_id", name="uq_social_account"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))  # facebook | instagram | youtube
    account_id: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(200))
    handle: Mapped[str | None] = mapped_column(String(200))
    picture_url: Mapped[str | None] = mapped_column(String(1000))
    token_enc: Mapped[str] = mapped_column(Text)
    refresh_enc: Mapped[str | None] = mapped_column(Text)
    selected: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    error: Mapped[str | None] = mapped_column(String(300))  # e.g. "Reconnect: the token was revoked"
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CampaignPost(Base):
    """One campaign posted to one social account."""

    __tablename__ = "campaign_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    account_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="posting")  # posting | posted | failed
    caption: Mapped[str] = mapped_column(Text)
    remote_id: Mapped[str | None] = mapped_column(String(120))
    url: Mapped[str | None] = mapped_column(String(500))
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WhatsAppInbound(Base):
    """Messages and button taps received from clients. The unique id stops Meta's retries being handled twice."""

    __tablename__ = "whatsapp_inbound"

    id: Mapped[int] = mapped_column(primary_key=True)
    wa_message_id: Mapped[str] = mapped_column(String(120), unique=True)
    from_phone: Mapped[str] = mapped_column(String(40), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # button | list | text | other
    payload: Mapped[str | None] = mapped_column(String(500))
    business_id: Mapped[int | None] = mapped_column(ForeignKey("businesses.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


# ---------------------------------------------------------------- admin / account management
class InviteCode(Base):
    """One code per SME deal. The SME signs up with it; you see who used which code."""

    __tablename__ = "invite_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(160))  # who it's for, e.g. "Layla Beauty Lounge – Al Barsha"
    note: Mapped[str | None] = mapped_column(Text)
    trial_days: Mapped[int] = mapped_column(Integer, default=14)
    plan: Mapped[str | None] = mapped_column(String(60))
    plan_amount: Mapped[Decimal | None] = mapped_column(Money)
    revoked: Mapped[bool] = mapped_column(default=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by_business_id: Mapped[int | None] = mapped_column(Integer)  # plain id: avoids a circular foreign key
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Payment(Base):
    """Manually recorded payment (bank transfer, cash, card link...)."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    paid_on: Mapped[date] = mapped_column(Date)
    covers_until: Mapped[date] = mapped_column(Date)
    method: Mapped[str | None] = mapped_column(String(40))
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ActivityDay(Base):
    """One row per business per calendar day (UAE time) on which the owner used the app."""

    __tablename__ = "activity_days"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)


class Event(Base):
    """Key moments for the admin timeline. Never holds a customer's name or number."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    detail: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
