"""Customer-facing endpoints. No login: the random token or QR code in the URL is the key."""

import hashlib
import io
from datetime import date, datetime, timedelta, timezone

from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..activity import record
from .. import schemas as s
from ..config import get_settings
from ..db import get_db
from .. import booking
from ..activity import UAE
from ..logic import find_customer_by_phone, initials, item_out, public_business, social_url, totals_out
from ..models import (
    Campaign,
    QuoteItem,
    LeadStatus,
    Appointment,
    AppointmentStatus,
    Business,
    CatalogItem,
    Customer,
    LinkClick,
    LinkItem,
    Stylist,
    Lead,
    QRCode,
    QRDestination,
    QREvent,
    QREventKind,
    Quote,
    QuoteStatus,
    QuoteView,
    ServiceRecord,
)
from ..pdf import quote_pdf
from ..utils import is_expired, normalize_phone, quote_label, valid_until, whatsapp_link
from .campaigns import campaign_expired, campaign_url, totals as campaign_totals, whatsapp_accept_url
from .. import creative
from .quotes import apply_decision
from ..utils import new_token

router = APIRouter(prefix="/public", tags=["public"])


def _ua(req: Request) -> str | None:
    ua = req.headers.get("user-agent")
    return ua[:300] if ua else None


def _client_hash(req: Request) -> str:
    ip = (req.headers.get("x-forwarded-for") or (req.client.host if req.client else "")).split(",")[0].strip()
    return hashlib.sha256(f"{ip}|{req.headers.get('user-agent', '')}".encode()).hexdigest()


def _qr(db: Session, code: str) -> QRCode:
    qr = db.scalar(select(QRCode).where(QRCode.code == code.upper()))
    if not qr or qr.archived:
        raise HTTPException(404, "This QR code is no longer active")
    return qr


def _business(db: Session, business_id: int) -> Business:
    return db.get(Business, business_id)


# ---------- QRLead ----------
@router.get("/r/{code}", response_model=s.RedirectOut)
def scan(code: str, req: Request, db: Session = Depends(get_db)):
    """Called when a printed QR is scanned. Counts the scan and says where to send the person."""
    qr = _qr(db, code)
    biz = _business(db, qr.business_id)
    qr.scans += 1
    db.add(QREvent(qr_id=qr.id, kind=QREventKind.scan, user_agent=_ua(req)))
    wa = whatsapp_link(biz.whatsapp or biz.phone, f"Hi {biz.name}, I'd like to enquire. (Ref: {qr.name})")
    if qr.destination == QRDestination.whatsapp and wa:
        qr.clicks += 1
        db.add(QREvent(qr_id=qr.id, kind=QREventKind.whatsapp, user_agent=_ua(req)))
        url = wa
    else:
        url = f"{get_settings().app_url.rstrip('/')}/l/{qr.code}"
    db.commit()
    return s.RedirectOut(url=url)


@router.get("/l/{code}", response_model=s.PublicLanding)
def landing(code: str, db: Session = Depends(get_db)):
    qr = _qr(db, code)
    biz = _business(db, qr.business_id)
    return s.PublicLanding(
        business=public_business(biz), source=qr.name, code=qr.code,
        menu=_menu(db, biz.id), team=_team(db, biz.id),
    )


@router.post("/l/{code}/click", response_model=s.RedirectOut)
def landing_click(code: str, body: s.ClickIn, req: Request, db: Session = Depends(get_db)):
    qr = _qr(db, code)
    biz = _business(db, qr.business_id)
    if body.kind == "whatsapp":
        url = whatsapp_link(biz.whatsapp or biz.phone, f"Hi {biz.name}, I'd like to enquire. (Ref: {qr.name})")
    else:
        n = normalize_phone(biz.phone or biz.whatsapp)
        url = f"tel:+{n}" if n else None
    if not url:
        raise HTTPException(409, "This business hasn't added a phone number yet")
    qr.clicks += 1
    db.add(QREvent(qr_id=qr.id, kind=QREventKind(body.kind), user_agent=_ua(req)))
    db.commit()
    return s.RedirectOut(url=url)


@router.post("/l/{code}/enquiry", status_code=201)
def enquiry(code: str, body: s.EnquiryIn, req: Request, db: Session = Depends(get_db)):
    qr = _qr(db, code)
    customer = find_customer_by_phone(db, qr.business_id, body.phone)
    if not customer:
        customer = Customer(business_id=qr.business_id, name=body.name, phone=body.phone)
        db.add(customer)
        db.flush()
    db.add(Lead(
        business_id=qr.business_id, customer_id=customer.id, qr_id=qr.id, source=qr.name, requirement=body.requirement,
        service_interest=body.service_interest, preferred_date=body.preferred_date, preferred_time=body.preferred_time,
        stylist_pref=body.stylist_pref,
    ))
    qr.clicks += 1
    db.add(QREvent(qr_id=qr.id, kind=QREventKind.enquiry, user_agent=_ua(req)))
    record(db, qr.business_id, "lead_received", qr.name)
    db.commit()
    return {"ok": True}


# ---------- QuoteLink ----------
def _quote(db: Session, token: str) -> Quote:
    q = db.scalar(select(Quote).where(Quote.token == token))
    if not q:
        raise HTTPException(404, "This quotation link is not valid")
    return q


def _open_days(b: Business) -> list[int]:
    shut = booking.closed_days(b)
    return [d for d in range(7) if d not in shut]


def _public_quote(q: Quote, db: Session | None = None) -> s.PublicQuote:
    live = [a for a in q.appointments if a.status not in (AppointmentStatus.cancelled, AppointmentStatus.no_show)]
    appt = live[0] if live else None
    from .. import quote_art

    pic, att = quote_art.public_bits(db, q) if db is not None else (None, None)
    return s.PublicQuote(
        picture_url=pic,
        attachment=att,
        booking_status="confirmed" if appt and q.status == QuoteStatus.accepted else q.booking_status,
        appointment_at=appt.starts_at if appt else None,
        appointment_token=appt.token if appt else None,
        stylist=appt.stylist.name if appt and appt.stylist else None,
        duration_min=booking.quote_duration(db, q) if db is not None else 60,
        open_days=_open_days(q.business),
        label=quote_label(q.number),
        business=public_business(q.business),
        customer_name=q.customer.name,
        items=[item_out(i) for i in q.items],
        vat_rate=q.vat_rate,
        totals=totals_out(q),
        currency=q.business.currency,
        valid_until=valid_until(q.created_at, q.valid_days),
        expired=q.status in (QuoteStatus.sent, QuoteStatus.viewed) and is_expired(q.created_at, q.valid_days),
        status=q.status,
        decided_at=q.decided_at,
        notes=q.notes,
        reference=q.reference,
        created_at=q.created_at,
    )


@router.get("/q/{token}", response_model=s.PublicQuote)
def view_quote(token: str, req: Request, preview: bool = Query(default=False), db: Session = Depends(get_db)):
    """preview=1 is used by the business's own "Preview" button so it doesn't count as a view."""
    q = _quote(db, token)
    if not preview:
        h = _client_hash(req)
        window = datetime.now(timezone.utc) - timedelta(seconds=get_settings().quote_view_dedupe_seconds)
        recent = [v for v in q.views if v.client_hash == h and _aware(v.viewed_at) > window]
        if not recent:
            db.add(QuoteView(quote_id=q.id, client_hash=h, user_agent=_ua(req)))
            if q.status == QuoteStatus.sent:
                q.status = QuoteStatus.viewed
            q.shared_at = q.shared_at or datetime.now(timezone.utc)  # the customer has it
            db.commit()
            db.refresh(q)
    return _public_quote(q, db)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _decide(db: Session, token: str, accepted: bool, when: s.AcceptIn | None = None) -> s.PublicQuote:
    q = _quote(db, token)
    if q.status in (QuoteStatus.accepted, QuoteStatus.rejected):
        raise HTTPException(409, f"This quotation was already {q.status.value}")
    if accepted and is_expired(q.created_at, q.valid_days):
        raise HTTPException(409, "This quotation has expired. Ask the business for an updated one.")
    apply_decision(db, q, accepted)
    if accepted and when and when.day and when.time:
        db.flush()
        booking.try_book(db, q, when.day, when.time)  # slot gone -> stays "awaiting"
    db.commit()
    db.refresh(q)
    return _public_quote(q, db)


@router.post("/q/{token}/accept", response_model=s.PublicQuote)
def accept_quote(token: str, body: s.AcceptIn | None = None, db: Session = Depends(get_db)):
    """Accept, and optionally book a time in the same step."""
    return _decide(db, token, True, body)


@router.get("/q/{token}/slots", response_model=s.SlotsOut)
def quote_slots(token: str, day: date = Query(), db: Session = Depends(get_db)):
    q = _quote(db, token)
    minutes = booking.quote_duration(db, q)
    return s.SlotsOut(day=day, duration_min=minutes, slots=booking.free_slots(db, q.business, day, minutes, " + ".join(i.description for i in q.items)))


@router.post("/q/{token}/book", response_model=s.PublicQuote)
def book_quote(token: str, body: s.AcceptIn, db: Session = Depends(get_db)):
    """Book a time after accepting (for clients who accepted first and chose a time later)."""
    q = _quote(db, token)
    if q.status != QuoteStatus.accepted:
        raise HTTPException(409, "Accept the quotation first")
    if q.booking_status == "confirmed":
        raise HTTPException(409, "This quotation is already booked")
    if not body.day or not body.time:
        raise HTTPException(422, "Choose a day and a time")
    if not booking.try_book(db, q, body.day, body.time):
        raise HTTPException(409, "That time was just taken. Please choose another.")
    db.commit()
    db.refresh(q)
    return _public_quote(q, db)


@router.post("/q/{token}/reject", response_model=s.PublicQuote)
def reject_quote(token: str, db: Session = Depends(get_db)):
    return _decide(db, token, False)


@router.get("/q/{token}/picture/{fmt}.jpg")
def quote_picture(token: str, fmt: str, db: Session = Depends(get_db)):
    """The picture sent with the quote (uploaded, or drawn from the quote). Public, for WhatsApp previews."""
    from .. import quote_art

    if fmt not in creative.SIZES:
        raise HTTPException(404, "Unknown format")
    got = quote_art.picture(db, _quote(db, token), fmt)
    if not got:
        raise HTTPException(404, "This quote has no picture")
    return Response(got[0], media_type=got[1], headers={"Cache-Control": "public, max-age=300"})


@router.get("/q/{token}/share.jpg")
def quote_share_image(token: str, db: Session = Depends(get_db)):
    """The quote's picture, small and square, for the WhatsApp link preview."""
    from .. import quote_art

    got = quote_art.picture(db, _quote(db, token), "square")
    if not got:
        raise HTTPException(404, "This quote has no picture")
    return Response(_share_jpeg(got[0]), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})


@router.get("/q/{token}/file")
def quote_file(token: str, db: Session = Depends(get_db)):
    """The uploaded picture or PDF brochure, as the owner sent it."""
    from .. import quote_art

    q = _quote(db, token)
    a = quote_art.file(db, q)
    if not a:
        raise HTTPException(404, "This quote has no brochure")
    name = (a.filename or "brochure").replace('"', "")
    return Response(a.data, media_type=a.content_type, headers={"Content-Disposition": f'inline; filename="{name}"'})


@router.get("/q/{token}/pdf")
def quote_pdf_public(token: str, db: Session = Depends(get_db)):
    q = _quote(db, token)
    return Response(
        quote_pdf(q),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{quote_label(q.number)}.pdf"'},
    )


# ---------- ServiceCard ----------
@router.get("/s/{token}", response_model=s.PublicService)
def service_card(token: str, db: Session = Depends(get_db)):
    r = db.scalar(select(ServiceRecord).where(ServiceRecord.token == token))
    if not r:
        raise HTTPException(404, "This service record link is not valid")
    history = db.scalars(
        select(ServiceRecord)
        .where(ServiceRecord.customer_id == r.customer_id)
        .order_by(ServiceRecord.service_date.desc(), ServiceRecord.id.desc())
    ).all()
    return s.PublicService(
        business=public_business(r.business),
        customer_name=r.customer.name,
        service=r.service,
        service_date=r.service_date,
        amount=r.amount,
        currency=r.business.currency,
        technician=r.technician,
        notes=r.notes,
        reference=r.reference,
        next_service_date=r.next_service_date,
        history=[s.PublicServiceEntry(service=h.service, service_date=h.service_date, amount=h.amount) for h in history],
    )


# ---------- Link page (link-in-bio for Instagram, TikTok, Snapchat…) ----------
def _page_business(db: Session, slug: str) -> Business:
    b = db.scalar(select(Business).where(Business.slug == slug.lower()))
    if not b or b.status == "suspended" or not b.link_page_enabled:
        raise HTTPException(404, "This page doesn't exist")
    return b


def _menu(db: Session, business_id: int) -> list[s.PublicMenuItem]:
    items = db.scalars(
        select(CatalogItem)
        .where(CatalogItem.business_id == business_id, CatalogItem.on_page.is_(True))
        .order_by(CatalogItem.id)
    ).all()
    # Sections in the order the salon added them (Hair before Bridal), uncategorised last.
    first: dict[str | None, int] = {}
    for n, i in enumerate(items):
        first.setdefault(i.category, n)
    items = sorted(items, key=lambda i: (i.category is None, first[i.category]))
    return [
        s.PublicMenuItem(name=i.name, price=i.unit_price, price_from=i.price_from, duration_min=i.duration_min, category=i.category)
        for i in items
    ]


def _team(db: Session, business_id: int) -> list[s.PublicStylist]:
    team = db.scalars(
        select(Stylist)
        .where(Stylist.business_id == business_id, Stylist.active.is_(True), Stylist.on_page.is_(True))
        .order_by(Stylist.position, Stylist.id)
    ).all()
    return [s.PublicStylist(id=m.id, name=m.name, role=m.role, color=m.color, initials=initials(m.name)) for m in team]


def _socials(b: Business) -> dict[str, str]:
    out = {}
    for kind in ("instagram", "tiktok", "snapchat", "facebook"):
        url = social_url(kind, getattr(b, kind))
        if url:
            out[kind] = url
    return out


@router.get("/b/{slug}", response_model=s.PublicLinkPage)
def link_page(slug: str, preview: bool = Query(default=False), db: Session = Depends(get_db)):
    """preview=1: the owner's editor and link previews (WhatsApp, Instagram) don't count as visits."""
    b = _page_business(db, slug)
    if not preview:
        b.link_views = (b.link_views or 0) + 1
        db.add(LinkClick(business_id=b.id, kind="view"))
        db.commit()
    links = db.scalars(select(LinkItem).where(LinkItem.business_id == b.id).order_by(LinkItem.position, LinkItem.id)).all()
    return s.PublicLinkPage(
        business=public_business(b),
        bio=b.bio,
        hours=b.hours,
        socials=_socials(b),
        maps_url=b.maps_url,
        theme=b.link_theme or "clay",
        motion=b.link_motion or "bloom",
        currency=b.currency,
        show_prices=b.link_show_prices,
        booking=b.link_booking,
        links=[s.LinkItemOut.model_validate(x) for x in links],
        menu=_menu(db, b.id),
        team=_team(db, b.id),
    )


@router.post("/b/{slug}/tap", response_model=s.RedirectOut)
def link_tap(slug: str, body: s.LinkTapIn, db: Session = Depends(get_db)):
    """Counts a tap on the page and says where to go."""
    b = _page_business(db, slug)
    url: str | None
    if body.kind == "link":
        item = db.get(LinkItem, body.link_id) if body.link_id else None
        if not item or item.business_id != b.id:
            raise HTTPException(404, "This link was removed")
        item.clicks += 1
        url = item.url
    elif body.kind == "whatsapp":
        url = whatsapp_link(b.whatsapp or b.phone, f"Hi {b.name}, I saw your page and I'd like to book.")
    elif body.kind == "call":
        n = normalize_phone(b.phone or b.whatsapp)
        url = f"tel:+{n}" if n else None
    elif body.kind == "maps":
        url = b.maps_url
    else:
        url = social_url(body.kind, getattr(b, body.kind))
    if not url:
        raise HTTPException(409, "This salon hasn't added that yet")
    db.add(LinkClick(business_id=b.id, kind=body.kind, link_id=body.link_id if body.kind == "link" else None))
    db.commit()
    return s.RedirectOut(url=url)


@router.post("/b/{slug}/book", status_code=201)
def booking_request(slug: str, body: s.BookingRequestIn, db: Session = Depends(get_db)):
    """A client asks for an appointment from the link page. It arrives as a lead to confirm."""
    b = _page_business(db, slug)
    if not b.link_booking:
        raise HTTPException(409, "This salon takes bookings on WhatsApp. Tap the WhatsApp button instead.")
    customer = find_customer_by_phone(db, b.id, body.phone)
    if not customer:
        customer = Customer(business_id=b.id, name=body.name, phone=body.phone)
        db.add(customer)
        db.flush()
    services = ", ".join(x.strip() for x in body.services if x.strip())[:300] or None
    db.add(Lead(
        business_id=b.id, customer_id=customer.id, source="Link page", requirement=(body.note or "").strip() or None,
        service_interest=services, preferred_date=body.preferred_date, preferred_time=body.preferred_time,
        stylist_pref=(body.stylist or "").strip() or None,
    ))
    db.add(LinkClick(business_id=b.id, kind="book"))
    record(db, b.id, "lead_received", "Link page")
    db.commit()
    first = body.name.split()[0]
    when = f" on {body.preferred_date:%a %d %b}" if body.preferred_date else ""
    msg = f"Hi {b.name}, I'm {first}. I just requested {services or 'an appointment'}{when} on your page."
    return {"ok": True, "whatsapp_url": whatsapp_link(b.whatsapp or b.phone, msg)}


# ---------- Appointment confirmation (the client's link) ----------
def _appointment(db: Session, token: str) -> Appointment:
    a = db.scalar(select(Appointment).where(Appointment.token == token))
    if not a:
        raise HTTPException(404, "This appointment link is not valid")
    return a


@router.get("/a/{token}", response_model=s.PublicAppointment)
def appointment_page(token: str, db: Session = Depends(get_db)):
    a = _appointment(db, token)
    b = a.business
    starts = a.starts_at if a.starts_at.tzinfo else a.starts_at.replace(tzinfo=UAE)
    return s.PublicAppointment(
        business=public_business(b),
        customer_name=a.customer.name,
        service=a.service,
        starts_at=starts,
        ends_at=starts + timedelta(minutes=a.duration_min),
        duration_min=a.duration_min,
        price=a.price,
        currency=b.currency,
        stylist=a.stylist.name if a.stylist else None,
        location=a.location,
        address=a.address if a.location == "home" else b.address,
        status=a.status,
        reschedule_url=whatsapp_link(
            b.whatsapp or b.phone,
            f"Hi {b.name}, I need to change my {a.service} appointment on {starts.astimezone(UAE):%a %d %b at %I:%M %p}.",
        ),
    )


def _ics_text(v: str) -> str:
    return v.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@router.get("/a/{token}/ics")
def appointment_ics(token: str, db: Session = Depends(get_db)):
    """'Add to calendar' file. Works with Apple, Google and Outlook calendars."""
    a = _appointment(db, token)
    if a.status in (AppointmentStatus.cancelled, AppointmentStatus.no_show):
        raise HTTPException(409, "This appointment was cancelled")
    b = a.business
    starts = (a.starts_at if a.starts_at.tzinfo else a.starts_at.replace(tzinfo=UAE)).astimezone(timezone.utc)
    ends = starts + timedelta(minutes=a.duration_min)
    fmt = "%Y%m%dT%H%M%SZ"
    where = a.address if a.location == "home" else (b.address or b.name)
    desc = f"{a.service}" + (f" with {a.stylist.name}" if a.stylist else "") + (f". Call {b.phone}" if b.phone else "")
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//salon//appointments//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{a.token}@{get_settings().app_url.split('//')[-1].split('/')[0]}",
        f"DTSTAMP:{datetime.now(timezone.utc):{fmt}}",
        f"DTSTART:{starts:{fmt}}",
        f"DTEND:{ends:{fmt}}",
        f"SUMMARY:{_ics_text(f'{a.service} · {b.name}')}",
        f"DESCRIPTION:{_ics_text(desc)}",
        *( [f"LOCATION:{_ics_text(where)}"] if where else [] ),
        "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", f"DESCRIPTION:{_ics_text(a.service)}", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return Response(
        "\r\n".join(lines) + "\r\n",
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="appointment.ics"'},
    )


# ---------- Campaign offers (social media, YouTube, ads) ----------
def _campaign(db: Session, token: str) -> Campaign:
    c = db.scalar(select(Campaign).where(Campaign.token == token.upper()))
    if not c or c.business.status == "suspended":
        raise HTTPException(404, "This offer link is not valid")
    return c


def _public_campaign(c: Campaign) -> s.PublicCampaign:
    return s.PublicCampaign(
        business=public_business(c.business), title=c.title, description=c.description,
        items=[item_out(i) for i in c.items], totals=campaign_totals(c), vat_rate=c.vat_rate, currency=c.business.currency,
        valid_until=c.valid_until, expired=campaign_expired(c), active=c.active, duration_min=c.duration_min,
        notes=c.notes, open_days=_open_days(c.business), whatsapp_accept_url=whatsapp_accept_url(c),
        image_version=creative.version(c),
    )


def _share_jpeg(data: bytes, side: int = 800) -> bytes:
    """A small square JPEG for link previews. WhatsApp leaves out pictures that are too big (over ~300 KB)."""
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    if w != h:  # centre-crop to a square so WhatsApp shows the large preview
        d = min(w, h)
        im = im.crop(((w - d) // 2, (h - d) // 2, (w - d) // 2 + d, (h - d) // 2 + d))
    im = im.resize((side, side), Image.LANCZOS)
    for quality in (82, 72, 62):
        out = io.BytesIO()
        im.save(out, "JPEG", quality=quality, optimize=True, progressive=False)
        if out.tell() < 250_000:
            break
    return out.getvalue()


@router.get("/c/{token}/share.jpg")
def campaign_share_image(token: str, db: Session = Depends(get_db)):
    """The picture WhatsApp/Facebook show when the offer link is shared."""
    c = _campaign(db, token)
    return Response(_share_jpeg(creative.render(c, campaign_url(c), "square")), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=300"})


_VIDEO_CACHE: dict[str, bytes] = {}


@router.get("/c/{token}/image/{fmt}.jpg")
def campaign_image(token: str, fmt: str, db: Session = Depends(get_db)):
    """The ready-to-post picture (square, portrait or story). Public, so Instagram and Facebook can fetch it."""
    if fmt not in creative.SIZES:
        raise HTTPException(404, "Unknown format")
    c = _campaign(db, token)
    return Response(creative.render(c, campaign_url(c), fmt), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=300"})


@router.get("/c/{token}/video.mp4")
def campaign_video(token: str, db: Session = Depends(get_db)):
    """An 8-second vertical video of the offer (YouTube Shorts, Reels)."""
    c = _campaign(db, token)
    key = f"{c.token}:{creative.version(c)}"
    if key not in _VIDEO_CACHE:
        if len(_VIDEO_CACHE) > 20:
            _VIDEO_CACHE.clear()
        _VIDEO_CACHE[key] = creative.video(c, campaign_url(c))
    return Response(_VIDEO_CACHE[key], media_type="video/mp4", headers={"Cache-Control": "public, max-age=300"})


@router.get("/c/{token}", response_model=s.PublicCampaign)
def view_campaign(token: str, preview: bool = Query(default=False), db: Session = Depends(get_db)):
    c = _campaign(db, token)
    if not preview:
        c.views += 1
        db.commit()
    return _public_campaign(c)


@router.get("/c/{token}/slots", response_model=s.SlotsOut)
def campaign_slots(token: str, day: date = Query(), db: Session = Depends(get_db)):
    c = _campaign(db, token)
    return s.SlotsOut(day=day, duration_min=c.duration_min, slots=booking.free_slots(db, c.business, day, c.duration_min, " + ".join(i.description for i in c.items)))


def create_campaign_quote(db: Session, c: Campaign, name: str, phone: str) -> Quote:
    """The client's own accepted quote for a campaign offer (from the offer page or WhatsApp)."""
    b = c.business
    customer = find_customer_by_phone(db, b.id, phone)
    if not customer:
        customer = Customer(business_id=b.id, name=name, phone=phone)
        db.add(customer)
        db.flush()
    lead = Lead(business_id=b.id, customer_id=customer.id, source=f"Campaign: {c.title}"[:80], service_interest=c.title[:300],
                status=LeadStatus.won)
    db.add(lead)
    biz = db.scalar(select(Business).where(Business.id == b.id).with_for_update())
    qt = new_token(10)
    while db.scalar(select(Quote.id).where(Quote.token == qt)):
        qt = new_token(10)
    now = datetime.now(timezone.utc)
    days_left = (c.valid_until - datetime.now(UAE).date()).days if c.valid_until else 7
    q = Quote(
        business_id=b.id, customer_id=customer.id, number=biz.next_quote_number, token=qt,
        discount=c.discount, vat_rate=c.vat_rate, valid_days=max(1, days_left), notes=c.notes, reference=c.title[:200],
        kind="campaign", campaign_id=c.id, status=QuoteStatus.accepted, decided_at=now, shared_at=now, booking_status="awaiting",
        items=[QuoteItem(position=i.position, description=i.description, quantity=i.quantity, unit_price=i.unit_price) for i in c.items],
    )
    biz.next_quote_number += 1
    db.add(q)
    db.flush()
    q.lead_id = lead.id
    record(db, b.id, "campaign_accepted", c.title)
    return q


@router.post("/c/{token}/accept", response_model=s.CampaignAcceptOut, status_code=201)
def accept_campaign(token: str, body: s.CampaignAcceptIn, db: Session = Depends(get_db)):
    """A client accepts the offer: they get their own accepted quote, booked if they chose a free time."""
    c = _campaign(db, token)
    if not c.active or campaign_expired(c):
        raise HTTPException(409, "This offer has ended. Message the salon for current prices.")
    q = create_campaign_quote(db, c, body.name, body.phone)
    slot_taken = False
    if body.day and body.time:
        db.flush()
        db.refresh(q)
        slot_taken = booking.try_book(db, q, body.day, body.time) is None
    db.commit()
    return s.CampaignAcceptOut(quote_token=q.token, booking_status=q.booking_status or "awaiting", slot_taken=slot_taken)
