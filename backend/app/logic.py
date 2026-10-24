"""Shared domain logic: customer resolution, serializers, lifecycle transitions."""

import re
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import schemas as s
from .config import get_settings
from .models import Appointment, Business, Customer, Lead, LeadStatus, Quote, ServiceRecord
from .utils import is_expired, money, normalize_phone, quote_label, quote_totals, valid_until, whatsapp_link


def get_owned(db: Session, model, obj_id: int, business_id: int, label: str):
    obj = db.get(model, obj_id)
    if not obj or obj.business_id != business_id:
        raise HTTPException(404, f"{label} not found")
    return obj


def find_customer_by_phone(db: Session, business_id: int, phone: str | None) -> Customer | None:
    n = normalize_phone(phone)
    if not n:
        return None
    for c in db.scalars(select(Customer).where(Customer.business_id == business_id, Customer.phone.is_not(None))):
        if normalize_phone(c.phone) == n:
            return c
    return None


def resolve_customer(db: Session, business_id: int, ref: s.CustomerRef) -> Customer:
    """Use the given customer, or create one. A new customer whose phone matches an
    existing one is merged into that record so the history stays in one place."""
    if ref.customer_id:
        return get_owned(db, Customer, ref.customer_id, business_id, "Customer")
    if not ref.new_customer:
        raise HTTPException(422, "Choose a customer or enter a new customer's name")
    existing = find_customer_by_phone(db, business_id, ref.new_customer.phone)
    if existing:
        return existing
    c = Customer(business_id=business_id, **ref.new_customer.model_dump())
    db.add(c)
    db.flush()
    return c


def initials(name: str) -> str:
    parts = [p for p in name.split() if p[:1].isalnum()]
    return "".join(p[0] for p in parts[:2]).upper() or "B"


def public_business(b: Business) -> s.PublicBusiness:
    return s.PublicBusiness(
        name=b.name,
        tagline=b.tagline,
        phone=b.phone,
        whatsapp_url=whatsapp_link(b.whatsapp or b.phone),
        address=b.address,
        trn=b.trn,
        initials=initials(b.name),
        business_type=b.business_type or "unisex",
        slug=b.slug,
    )


def item_out(i) -> s.QuoteItemOut:
    return s.QuoteItemOut(
        description=i.description,
        quantity=i.quantity,
        unit_price=i.unit_price,
        line_total=money(i.quantity * i.unit_price),
    )


def totals_out(q: Quote) -> s.TotalsOut:
    t = quote_totals(q.items, q.discount, q.vat_rate)
    return s.TotalsOut(subtotal=t.subtotal, discount=t.discount, taxable=t.taxable, vat=t.vat, total=t.total)


def quote_url(q: Quote) -> str:
    return f"{get_settings().app_url.rstrip('/')}/q/{q.token}"


def service_url(r: ServiceRecord) -> str:
    return f"{get_settings().app_url.rstrip('/')}/s/{r.token}"


def qr_target(code: str) -> str:
    return f"{get_settings().app_url.rstrip('/')}/r/{code}"


def quote_out(db: Session, q: Quote) -> s.QuoteOut:
    first = q.customer.name.split()[0] if q.customer.name else ""
    svc_id = q.service_records[0].id if q.service_records else None
    url = quote_url(q)
    live = [a for a in q.appointments if a.status.value not in ("cancelled", "no_show")]
    appt = live[0] if live else None
    msg = f"Hi {first}, here is your quotation {quote_label(q.number)} from {q.business.name}: {url}"
    return s.QuoteOut(
        id=q.id,
        number=q.number,
        label=quote_label(q.number),
        token=q.token,
        public_url=url,
        customer=s.CustomerOut.model_validate(q.customer),
        lead_id=q.lead_id,
        items=[item_out(i) for i in q.items],
        vat_rate=q.vat_rate,
        valid_days=q.valid_days,
        valid_until=valid_until(q.created_at, q.valid_days),
        expired=q.status in ("sent", "viewed") and is_expired(q.created_at, q.valid_days),
        notes=q.notes,
        reference=q.reference,
        status=q.status,
        totals=totals_out(q),
        view_count=len(q.views),
        views=[v.viewed_at for v in q.views],
        decided_at=q.decided_at,
        shared_at=q.shared_at,
        created_at=q.created_at,
        service_record_id=svc_id,
        share_message=msg,
        kind=q.kind or "direct",
        campaign_id=q.campaign_id,
        campaign_title=q.campaign.title if q.campaign_id and q.campaign else None,
        booking_status="confirmed" if appt and q.status.value == "accepted" else q.booking_status or ("awaiting" if q.status.value == "accepted" else None),
        appointment_id=appt.id if appt else None,
        appointment_at=appt.starts_at if appt else None,
        whatsapp_url=whatsapp_link(q.customer.phone, msg),
    )


def service_out(r: ServiceRecord) -> s.ServiceOut:
    out = s.ServiceOut.model_validate(r)
    out.public_url = service_url(r)
    return out


def set_lead_status(db: Session, lead_id: int | None, status: LeadStatus, only_from: tuple = ()) -> None:
    if not lead_id:
        return
    lead = db.get(Lead, lead_id)
    if lead and (not only_from or lead.status in only_from):
        lead.status = status


# ---------------------------------------------------------------- appointments
def appointment_url(a: Appointment) -> str:
    return f"{get_settings().app_url.rstrip('/')}/a/{a.token}"


def appointment_out(a: Appointment) -> s.AppointmentOut:
    return s.AppointmentOut(
        id=a.id,
        token=a.token,
        public_url=appointment_url(a),
        customer=s.CustomerOut.model_validate(a.customer),
        stylist=s.StylistOut.model_validate(a.stylist) if a.stylist else None,
        lead_id=a.lead_id,
        quote_id=a.quote_id,
        service_record_id=a.service_record_id,
        service=a.service,
        starts_at=a.starts_at,
        ends_at=a.starts_at + timedelta(minutes=a.duration_min),
        duration_min=a.duration_min,
        price=a.price,
        location=a.location,
        address=a.address,
        notes=a.notes,
        status=a.status,
        confirmed_at=a.confirmed_at,
        reminded_at=a.reminded_at,
        created_at=a.created_at,
    )


# ---------------------------------------------------------------- link page
# Top-level paths the web app already uses. A salon can't take these as its page address.
RESERVED_SLUGS = {
    "a", "b", "l", "q", "r", "s", "admin", "api", "app", "appointments", "book", "customers", "clients", "dashboard",
    "diary", "forgot-password", "help", "home", "leads", "link", "login", "logout", "menu", "pricing", "privacy",
    "qr", "quotes", "reset-password", "services", "settings", "signup", "support", "team", "terms", "visits", "www",
}
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")


def slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:36].strip("-")
    return base if len(base) >= 3 else (base + "-salon").strip("-")


def clean_slug(raw: str) -> str:
    v = raw.strip().lower().lstrip("@/")
    if not SLUG_RE.match(v) or "--" in v:
        raise HTTPException(422, "Use 3–40 letters, numbers or dashes for your page address, e.g. layla-beauty")
    if v in RESERVED_SLUGS:
        raise HTTPException(409, "That address is taken. Try adding your area, e.g. layla-beauty-barsha")
    return v


def unique_slug(db: Session, name: str, exclude_business_id: int | None = None) -> str:
    base = slugify(name)
    if base in RESERVED_SLUGS:
        base = f"{base}-salon"
    slug, n = base, 2
    while True:
        owner = db.scalar(select(Business.id).where(Business.slug == slug))
        if not owner or owner == exclude_business_id:
            return slug
        slug, n = f"{base}-{n}", n + 1


def link_page_url(b: Business) -> str | None:
    return f"{get_settings().app_url.rstrip('/')}/{b.slug}" if b.slug else None


def clean_handle(v: str | None) -> str | None:
    """'@layla.beauty', 'instagram.com/layla.beauty/' and 'layla.beauty' all become 'layla.beauty'."""
    if not v:
        return None
    v = v.strip()
    if v.lower().startswith(("http://", "https://")) or "." in v.split("/")[0] and "/" in v:
        v = re.sub(r"^https?://", "", v, flags=re.I)
        parts = [p for p in v.split("/")[1:] if p]
        if not parts:
            return None
        v = parts[-1] if parts[0].lower() == "add" else parts[0]
    v = v.split("?")[0].lstrip("@").strip()
    return v[:80] or None


def social_url(kind: str, value: str | None) -> str | None:
    if not value:
        return None
    if kind == "facebook":
        return value if value.lower().startswith(("http://", "https://")) else f"https://facebook.com/{value.lstrip('@')}"
    h = clean_handle(value)
    if not h:
        return None
    return {
        "instagram": f"https://instagram.com/{h}",
        "tiktok": f"https://www.tiktok.com/@{h}",
        "snapchat": f"https://www.snapchat.com/add/{h}",
    }.get(kind)
