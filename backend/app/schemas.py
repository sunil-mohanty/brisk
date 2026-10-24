from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .models import AppointmentStatus, LeadStatus, QRDestination, QuoteStatus


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# Kind of salon. Changes the starter service menu and a few words in the app.
BUSINESS_TYPES = ("unisex", "ladies", "gents", "spa", "nails", "home")


def clean_business_type(v: str | None) -> str:
    v = (v or "").strip().lower()
    return v if v in BUSINESS_TYPES else "unisex"


# ---------- auth / business ----------
class SignupIn(BaseModel):
    business_name: str = Field(min_length=2, max_length=160)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = None
    invite_code: str | None = None
    business_type: str | None = Field(default=None, max_length=30)
    source: str | None = Field(default=None, max_length=120)  # utm_source or referrer
    campaign: str | None = Field(default=None, max_length=160)  # utm_campaign


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class BusinessOut(ORM):
    id: int
    name: str
    phone: str | None
    whatsapp: str | None
    email: str | None
    tagline: str | None
    address: str | None
    trn: str | None
    currency: str
    default_vat_rate: Decimal
    business_type: str = "unisex"
    checklist_hidden: bool = False
    trial_ends_at: date | None = None
    slug: str | None = None
    link_page_enabled: bool = False
    open_time: str = "10:00"
    close_time: str = "22:00"
    closed_days: str = ""


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = None
    whatsapp: str | None = None
    email: EmailStr | None = None
    tagline: str | None = Field(default=None, max_length=240)
    address: str | None = None
    trn: str | None = Field(default=None, max_length=30)
    default_vat_rate: Decimal | None = Field(default=None, ge=0, le=100)
    business_type: str | None = Field(default=None, max_length=30)
    checklist_hidden: bool | None = None
    open_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    close_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$|^24:00$")
    closed_days: str | None = Field(default=None, pattern=r"^([0-6](,[0-6])*)?$")


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=2000)
    password: str = Field(min_length=8, max_length=128)


class MessageOut(BaseModel):
    message: str


class UserOut(ORM):
    id: int
    name: str
    email: str
    is_admin: bool = False
    seen_tips: list[str] = []


class TipsIn(BaseModel):
    seen: list[str] = Field(default=[], max_length=50)
    reset: bool = False
    enabled: bool | None = None  # the Tips on/off switch


class AuthOut(BaseModel):
    token: str
    user: UserOut
    business: BusinessOut


# ---------- customers ----------
class CustomerIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    area: str | None = Field(default=None, max_length=120)
    notes: str | None = None


class CustomerOut(ORM):
    id: int
    name: str
    phone: str | None
    email: str | None
    area: str | None
    notes: str | None
    created_at: datetime


class CustomerSummary(CustomerOut):
    first_source: str | None
    leads: int
    quotes: int
    services: int
    lifetime_value: Decimal
    stage: str  # Acquire | Quote | Serve | Retain


class ImportRowIn(BaseModel):
    name: str = Field(default="", max_length=300)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=300)
    area: str | None = Field(default=None, max_length=300)


class ImportPreviewIn(BaseModel):
    """Contacts picked on the phone (rows) or a pasted list (text)."""

    rows: list[ImportRowIn] | None = Field(default=None, max_length=5000)
    text: str | None = Field(default=None, max_length=500_000)


class ImportPreviewRow(BaseModel):
    name: str
    phone: str | None
    email: str | None
    area: str | None
    status: str  # new | existing | duplicate | no_phone
    existing_name: str | None = None


class ImportPreviewOut(BaseModel):
    rows: list[ImportPreviewRow]
    counts: dict[str, int]


class ImportCommitIn(BaseModel):
    rows: list[ImportRowIn] = Field(min_length=1, max_length=5000)


class ImportResultOut(BaseModel):
    created: int
    skipped: int


class CustomerRef(BaseModel):
    """Either an existing customer_id, or details for a new customer."""

    customer_id: int | None = None
    new_customer: CustomerIn | None = None


# ---------- leads ----------
class LeadIn(CustomerRef):
    source: str = Field(default="Walk-in", max_length=80)
    requirement: str | None = None
    service_interest: str | None = Field(default=None, max_length=300)
    preferred_date: date | None = None
    preferred_time: str | None = Field(default=None, max_length=40)
    stylist_pref: str | None = Field(default=None, max_length=120)


class LeadUpdate(BaseModel):
    status: LeadStatus | None = None
    requirement: str | None = None
    source: str | None = Field(default=None, max_length=80)
    service_interest: str | None = Field(default=None, max_length=300)
    preferred_date: date | None = None
    preferred_time: str | None = Field(default=None, max_length=40)


class LeadOut(ORM):
    id: int
    customer: CustomerOut
    qr_id: int | None
    source: str
    requirement: str | None
    service_interest: str | None = None
    preferred_date: date | None = None
    preferred_time: str | None = None
    stylist_pref: str | None = None
    status: LeadStatus
    created_at: datetime
    appointment_id: int | None = None


# ---------- QR ----------
class QRIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    campaign: str | None = Field(default=None, max_length=120)
    destination: QRDestination = QRDestination.landing


class QRUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    campaign: str | None = None
    destination: QRDestination | None = None
    archived: bool | None = None


class QROut(ORM):
    id: int
    code: str
    name: str
    campaign: str | None
    destination: QRDestination
    scans: int
    clicks: int
    leads: int = 0
    archived: bool
    created_at: datetime
    target_url: str = ""  # what the printed QR encodes


# ---------- quotes ----------
class QuoteItemIn(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    unit_price: Decimal = Field(ge=0)


class QuoteIn(CustomerRef):
    lead_id: int | None = None
    items: list[QuoteItemIn] = Field(min_length=1, max_length=50)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0, le=100)
    valid_days: int = Field(default=7, ge=1, le=365)
    notes: str | None = None
    reference: str | None = Field(default=None, max_length=200)


class QuoteItemOut(ORM):
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal = Decimal("0")


class TotalsOut(BaseModel):
    subtotal: Decimal
    discount: Decimal
    taxable: Decimal
    vat: Decimal
    total: Decimal


class QuoteOut(BaseModel):
    id: int
    number: int
    label: str
    token: str
    public_url: str
    customer: CustomerOut
    lead_id: int | None
    items: list[QuoteItemOut]
    vat_rate: Decimal
    valid_days: int
    valid_until: date
    expired: bool
    notes: str | None
    reference: str | None = None
    status: QuoteStatus
    totals: TotalsOut
    view_count: int
    views: list[datetime]
    decided_at: datetime | None
    shared_at: datetime | None = None
    created_at: datetime
    service_record_id: int | None = None
    share_message: str
    kind: str = "direct"
    campaign_id: int | None = None
    campaign_title: str | None = None
    booking_status: str | None = None
    appointment_id: int | None = None
    appointment_at: datetime | None = None
    whatsapp_url: str | None = None
    wa_status: str | None = None  # the quote sent automatically on WhatsApp: sent | delivered | read | failed
    wa_error: str | None = None


# ---------- services ----------
class ServiceIn(CustomerRef):
    quote_id: int | None = None
    service: str = Field(min_length=1, max_length=300)
    service_date: date
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    technician: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    reference: str | None = Field(default=None, max_length=200)
    next_service_date: date | None = None
    next_service_months: int | None = Field(default=None, ge=1, le=60)


class ServiceUpdate(BaseModel):
    service: str | None = None
    service_date: date | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    technician: str | None = None
    notes: str | None = None
    reference: str | None = Field(default=None, max_length=200)
    next_service_date: date | None = None


class ServiceOut(ORM):
    id: int
    token: str
    public_url: str = ""
    customer: CustomerOut
    quote_id: int | None
    service: str
    service_date: date
    amount: Decimal
    technician: str | None
    notes: str | None
    reference: str | None = None
    next_service_date: date | None
    reminder_sent_at: datetime | None
    created_at: datetime


class CatalogIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    category: str | None = Field(default=None, max_length=60)
    duration_min: int | None = Field(default=None, ge=5, le=720)


class CatalogUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=300)
    unit_price: Decimal | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, max_length=60)
    duration_min: int | None = Field(default=None, ge=5, le=720)
    price_from: bool | None = None
    on_page: bool | None = None


class CatalogOut(ORM):
    id: int
    name: str
    unit_price: Decimal
    category: str | None = None
    duration_min: int | None = None
    price_from: bool = False
    on_page: bool = True
    uses: int


class ReminderOut(BaseModel):
    whatsapp_url: str | None
    message: str


# ---------- dashboard ----------
class SourceCount(BaseModel):
    source: str
    leads: int


class DashboardOut(BaseModel):
    leads: int
    new_leads: int
    quotes: int
    open_quotes: int
    services: int
    due_soon: int
    won_value: Decimal
    acceptance_rate: int | None
    sources: list[SourceCount]
    recent_quotes: list[QuoteOut]
    due_services: list[ServiceOut]
    today: list["AppointmentOut"] = []
    upcoming: int = 0  # appointments in the next 7 days
    link_views: int = 0
    link_views_7d: int = 0
    link_taps_7d: int = 0
    awaiting_booking: list[QuoteOut] = []
    to_send: list["OutboundOut"] = []
    low_stock: int = 0
    whatsapp_auto: bool = False
    setup: dict[str, bool] = {}


# ---------- public ----------
class PublicBusiness(BaseModel):
    name: str
    tagline: str | None
    phone: str | None
    whatsapp_url: str | None
    address: str | None
    trn: str | None
    initials: str
    business_type: str = "unisex"
    slug: str | None = None


class PublicQuote(BaseModel):
    label: str
    business: PublicBusiness
    customer_name: str
    items: list[QuoteItemOut]
    vat_rate: Decimal
    totals: TotalsOut
    currency: str
    valid_until: date
    expired: bool
    status: QuoteStatus
    decided_at: datetime | None
    notes: str | None
    reference: str | None = None
    created_at: datetime
    booking_status: str | None = None
    appointment_at: datetime | None = None
    appointment_token: str | None = None
    stylist: str | None = None
    duration_min: int = 60
    open_days: list[int] = []  # weekdays the salon is open (Mon=0), for the date picker


class AcceptIn(BaseModel):
    day: date | None = None
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class SlotsOut(BaseModel):
    day: date
    duration_min: int
    slots: list[str]


class PublicServiceEntry(BaseModel):
    service: str
    service_date: date
    amount: Decimal


class PublicService(BaseModel):
    business: PublicBusiness
    customer_name: str
    service: str
    service_date: date
    amount: Decimal
    currency: str
    technician: str | None
    notes: str | None
    reference: str | None = None
    next_service_date: date | None
    history: list[PublicServiceEntry]


class PublicLanding(BaseModel):
    business: PublicBusiness
    source: str
    code: str
    menu: list["PublicMenuItem"] = []
    team: list["PublicStylist"] = []


class EnquiryIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str = Field(min_length=6, max_length=40)
    requirement: str | None = Field(default=None, max_length=2000)
    service_interest: str | None = Field(default=None, max_length=300)
    preferred_date: date | None = None
    preferred_time: str | None = Field(default=None, max_length=40)
    stylist_pref: str | None = Field(default=None, max_length=120)

    @field_validator("name", "phone")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class ClickIn(BaseModel):
    kind: str = Field(pattern="^(whatsapp|call)$")


class RedirectOut(BaseModel):
    url: str


# ---------- team ----------
class StylistIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    on_page: bool = True


class StylistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    on_page: bool | None = None
    active: bool | None = None
    position: int | None = None


class StylistOut(ORM):
    id: int
    name: str
    role: str | None
    color: str
    on_page: bool
    active: bool
    position: int


# ---------- appointments (jobs) ----------
class AppointmentIn(CustomerRef):
    service: str = Field(min_length=1, max_length=300)
    starts_at: datetime
    duration_min: int = Field(default=60, ge=5, le=720)
    price: Decimal = Field(default=Decimal("0"), ge=0)
    stylist_id: int | None = None
    lead_id: int | None = None
    quote_id: int | None = None
    location: str = Field(default="salon", pattern="^(salon|home)$")
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = None
    force: bool = False  # book even if the stylist is already busy


class AppointmentUpdate(BaseModel):
    service: str | None = Field(default=None, min_length=1, max_length=300)
    starts_at: datetime | None = None
    duration_min: int | None = Field(default=None, ge=5, le=720)
    price: Decimal | None = Field(default=None, ge=0)
    stylist_id: int | None = None
    location: str | None = Field(default=None, pattern="^(salon|home)$")
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = None
    status: AppointmentStatus | None = None
    force: bool = False


class AppointmentCompleteIn(BaseModel):
    price: Decimal | None = Field(default=None, ge=0)  # final amount paid, if different
    notes: str | None = None  # colour formula, products used…
    next_visit_weeks: int | None = Field(default=None, ge=1, le=104)


class AppointmentOut(BaseModel):
    id: int
    token: str
    public_url: str
    customer: CustomerOut
    stylist: StylistOut | None
    lead_id: int | None
    quote_id: int | None
    service_record_id: int | None
    service: str
    starts_at: datetime
    ends_at: datetime
    duration_min: int
    price: Decimal
    location: str
    address: str | None
    notes: str | None
    status: AppointmentStatus
    confirmed_at: datetime | None
    reminded_at: datetime | None
    created_at: datetime


class MessageLinkOut(BaseModel):
    whatsapp_url: str | None
    message: str


class PublicAppointment(BaseModel):
    business: PublicBusiness
    customer_name: str
    service: str
    starts_at: datetime
    ends_at: datetime
    duration_min: int
    price: Decimal
    currency: str
    stylist: str | None
    location: str
    address: str | None
    status: AppointmentStatus
    reschedule_url: str | None


# ---------- link page ----------
class LinkItemIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=4, max_length=500)
    highlight: bool = False

    @field_validator("url")
    @classmethod
    def http_only(cls, v: str) -> str:
        v = v.strip()
        if not v.lower().startswith(("http://", "https://")):
            v = "https://" + v
        return v


class LinkItemUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    url: str | None = Field(default=None, min_length=4, max_length=500)
    highlight: bool | None = None
    position: int | None = None

    @field_validator("url")
    @classmethod
    def http_only(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v if v.lower().startswith(("http://", "https://")) else "https://" + v


class LinkItemOut(ORM):
    id: int
    label: str
    url: str
    highlight: bool
    position: int
    clicks: int


LINK_THEMES = ("clay", "sand", "rose", "noir", "sage")
LINK_MOTIONS = ("bloom", "drift", "shimmer", "calm")


class LinkPageUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=3, max_length=40)
    bio: str | None = Field(default=None, max_length=300)
    instagram: str | None = Field(default=None, max_length=120)
    tiktok: str | None = Field(default=None, max_length=120)
    snapchat: str | None = Field(default=None, max_length=120)
    facebook: str | None = Field(default=None, max_length=200)
    maps_url: str | None = Field(default=None, max_length=500)
    hours: str | None = Field(default=None, max_length=200)
    link_theme: str | None = None
    link_motion: str | None = None
    link_show_prices: bool | None = None
    link_booking: bool | None = None


class LinkPageOut(BaseModel):
    slug: str | None
    url: str | None
    bio: str | None
    instagram: str | None
    tiktok: str | None
    snapchat: str | None
    facebook: str | None
    maps_url: str | None
    hours: str | None
    link_theme: str
    link_motion: str
    link_show_prices: bool
    link_booking: bool
    links: list[LinkItemOut]
    views: int
    views_7d: int
    taps_7d: dict[str, int]
    bookings_30d: int


class PublicMenuItem(BaseModel):
    name: str
    price: Decimal
    price_from: bool
    duration_min: int | None
    category: str | None


class PublicStylist(BaseModel):
    id: int
    name: str
    role: str | None
    color: str
    initials: str


class PublicLinkPage(BaseModel):
    business: PublicBusiness
    bio: str | None
    hours: str | None
    socials: dict[str, str]  # instagram -> https://instagram.com/x, …
    maps_url: str | None
    theme: str
    motion: str
    currency: str
    show_prices: bool
    booking: bool
    links: list[LinkItemOut]
    menu: list[PublicMenuItem]
    team: list[PublicStylist]


class LinkTapIn(BaseModel):
    kind: str = Field(pattern="^(whatsapp|call|instagram|tiktok|snapchat|facebook|maps|link)$")
    link_id: int | None = None


class BookingRequestIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str = Field(min_length=6, max_length=40)
    services: list[str] = Field(default=[], max_length=10)
    preferred_date: date | None = None
    preferred_time: str | None = Field(default=None, max_length=40)
    stylist: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("name", "phone")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()




# ---------- bulk quotes ----------
class BulkQuoteIn(BaseModel):
    customer_ids: list[int] = Field(min_length=1, max_length=500)
    items: list[QuoteItemIn] = Field(min_length=1, max_length=50)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0, le=100)
    valid_days: int = Field(default=7, ge=1, le=365)
    notes: str | None = None
    reference: str | None = Field(default=None, max_length=200)


# ---------- campaigns ----------
class CampaignIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    items: list[QuoteItemIn] = Field(min_length=1, max_length=30)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0, le=100)
    valid_until: date | None = None
    duration_min: int | None = Field(default=None, ge=15, le=600)
    notes: str | None = None
    active: bool = True


class CampaignOut(BaseModel):
    id: int
    token: str
    public_url: str
    title: str
    description: str | None
    items: list[QuoteItemOut]
    totals: TotalsOut
    vat_rate: Decimal
    valid_until: date | None
    expired: bool
    duration_min: int
    notes: str | None
    active: bool
    views: int
    accepted: int
    booked: int
    created_at: datetime
    share_text: str
    whatsapp_accept_url: str | None = None
    image_version: str = ""
    post_caption: str = ""


class PublicCampaign(BaseModel):
    business: PublicBusiness
    title: str
    description: str | None
    items: list[QuoteItemOut]
    totals: TotalsOut
    vat_rate: Decimal
    currency: str
    valid_until: date | None
    expired: bool
    active: bool
    duration_min: int
    notes: str | None
    open_days: list[int] = []
    whatsapp_accept_url: str | None = None  # opens a chat with the business number, pre-filled with the offer code


class CampaignAcceptIn(AcceptIn):
    name: str = Field(min_length=1, max_length=160)
    phone: str = Field(min_length=6, max_length=40)

    @field_validator("name", "phone")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class CampaignAcceptOut(BaseModel):
    quote_token: str
    booking_status: str
    slot_taken: bool = False


class WhatsAppStatus(BaseModel):
    automatic: bool  # booking confirmations go out by themselves
    quotes: bool  # quotes go out with Accept / Decline buttons
    webhook: bool  # replies from clients are handled (verify token set)
    business_number: str | None = None


class WhatsAppSendOut(BaseModel):
    status: str  # sent | failed | manual
    error: str | None = None
    whatsapp_url: str | None = None  # for "manual": open WhatsApp on the owner's phone instead


class BulkSendIn(BaseModel):
    quote_ids: list[int] = Field(min_length=1, max_length=300)


class BulkSendOut(BaseModel):
    sent: int
    failed: int
    manual: int


class SocialAccountOut(ORM):
    id: int
    provider: str
    name: str
    handle: str | None
    picture_url: str | None
    selected: bool
    error: str | None
    connected_at: datetime


class SocialStatus(BaseModel):
    meta_ready: bool  # the platform's Meta app is set up (Facebook + Instagram)
    google_ready: bool  # the platform's Google project is set up (YouTube)
    accounts: list[SocialAccountOut]


class ConnectOut(BaseModel):
    url: str


class PublishIn(BaseModel):
    providers: list[str] = Field(min_length=1, max_length=3)
    caption: str | None = Field(default=None, max_length=2200)


class CampaignPostOut(ORM):
    id: int
    provider: str
    account_name: str
    status: str
    url: str | None
    error: str | None
    created_at: datetime
    posted_at: datetime | None


# ---------- inventory ----------
class InventoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=60)
    sku: str | None = Field(default=None, max_length=60)
    unit: str = Field(default="pcs", max_length=20)
    stock: Decimal = Field(default=Decimal("0"))
    low_stock: Decimal = Field(default=Decimal("0"), ge=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    sell_price: Decimal | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=160)
    notes: str | None = None


class InventoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=60)
    sku: str | None = Field(default=None, max_length=60)
    unit: str | None = Field(default=None, max_length=20)
    low_stock: Decimal | None = Field(default=None, ge=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    sell_price: Decimal | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=160)
    notes: str | None = None


class InventoryOut(ORM):
    id: int
    name: str
    category: str | None
    sku: str | None
    unit: str
    stock: Decimal
    low_stock: Decimal
    cost_price: Decimal | None
    sell_price: Decimal | None
    supplier: str | None
    notes: str | None
    updated_at: datetime
    low: bool = False


class StockMoveIn(BaseModel):
    change: Decimal
    reason: str = Field(pattern="^(received|used|sold|adjust)$")
    note: str | None = Field(default=None, max_length=300)


class StockMoveOut(ORM):
    id: int
    change: Decimal
    reason: str
    note: str | None
    created_at: datetime


# ---------- messages waiting for the owner ----------
class OutboundOut(ORM):
    id: int
    appointment_id: int | None
    to_name: str | None
    to_phone: str | None
    kind: str
    body: str
    status: str
    created_at: datetime
    whatsapp_url: str | None = None


DashboardOut.model_rebuild()
PublicLanding.model_rebuild()
