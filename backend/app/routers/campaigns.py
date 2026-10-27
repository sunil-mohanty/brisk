"""Campaign quotes: one public offer for social media, YouTube and ads. Each client who accepts
gets their own accepted quote (and appointment, if they book a time)."""

import io
import random
import re
from datetime import datetime

import segno
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import schemas as s
from ..activity import UAE, record
from ..config import get_settings
from ..db import get_db
from .. import ai_art, creative, designer, social, whatsapp
from ..logic import get_owned, item_out
from ..models import Campaign, CampaignItem, CampaignSend, Customer, Quote, User
from ..security import current_user
from ..utils import money, new_token, quote_totals, whatsapp_link

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def campaign_url(c: Campaign) -> str:
    return f"{get_settings().app_url.rstrip('/')}/c/{c.token}"


def campaign_expired(c: Campaign) -> bool:
    return bool(c.valid_until and c.valid_until < datetime.now(UAE).date())


def totals(c: Campaign) -> s.TotalsOut:
    t = quote_totals(c.items, c.discount, c.vat_rate)
    return s.TotalsOut(subtotal=t.subtotal, discount=t.discount, taxable=t.taxable, vat=t.vat, total=t.total)


def campaign_out(db: Session, c: Campaign) -> s.CampaignOut:
    accepted, booked = db.execute(
        select(func.count(Quote.id), func.count(Quote.id).filter(Quote.booking_status == "confirmed")).where(Quote.campaign_id == c.id)
    ).one()
    t = totals(c)
    url = campaign_url(c)
    until = f" Offer ends {c.valid_until:%d %b}." if c.valid_until else ""
    return s.CampaignOut(
        id=c.id, token=c.token, public_url=url, title=c.title, description=c.description,
        items=[item_out(i) for i in c.items], totals=t, vat_rate=c.vat_rate, valid_until=c.valid_until,
        expired=campaign_expired(c), duration_min=c.duration_min, notes=c.notes, active=c.active, views=c.views,
        accepted=accepted, booked=booked, created_at=c.created_at,
        share_text=f"{c.title} at {c.business.name}: {c.business.currency} {t.total:,.0f}.{until} Accept and book your time here: {url}"
        + (f" or on WhatsApp: {wa}" if (wa := whatsapp_accept_url(c)) else ""),
        whatsapp_accept_url=wa,
        image_version=creative.version(c),
        post_caption=social.default_caption(c, url),
        design_style=c.design_style or "classic",
        theme=designer.detect(c).label,
        has_ai_art=c.art_id is not None,
        ai_left=ai_art.left_this_month(db, c.business_id),
        sent_whatsapp=db.scalar(select(func.count(CampaignSend.id)).where(CampaignSend.campaign_id == c.id)) or 0,
    )


def client_message(c: Campaign, first_name: str) -> str:
    """What the owner sends to one client. The link at the end makes WhatsApp show the offer picture."""
    t = totals(c)
    until = f" Offer ends {c.valid_until:%d %b}." if c.valid_until else ""
    hi = f"Hi {first_name}!" if first_name else "Hi!"
    return (f"{hi} {c.title} at {c.business.name}: {c.business.currency} {t.total:,.0f}.{until}\n"
            f"See the offer and book your time: {campaign_url(c)}")


def whatsapp_accept_url(c: Campaign) -> str | None:
    """Chat with the business number, pre-filled; the bot reads the code and replies with free times."""
    return whatsapp.accept_link(f"Hi! I'd like to accept the offer \"{c.title}\" from {c.business.name} (code {c.token})")


def _items(body_items) -> list[CampaignItem]:
    return [CampaignItem(position=n, description=i.description.strip(), quantity=i.quantity, unit_price=i.unit_price) for n, i in enumerate(body_items)]


def _get(db: Session, cid: int, bid: int) -> Campaign:
    return get_owned(db, Campaign, cid, bid, "Campaign")


@router.get("", response_model=list[s.CampaignOut])
def list_campaigns(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Campaign).where(Campaign.business_id == user.business_id).options(selectinload(Campaign.items)).order_by(Campaign.id.desc())
    ).all()
    return [campaign_out(db, c) for c in rows]


@router.post("", response_model=s.CampaignOut, status_code=201)
def create_campaign(body: s.CampaignIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    token = new_token(8)
    while db.scalar(select(Campaign.id).where(Campaign.token == token)):
        token = new_token(8)
    c = Campaign(
        business_id=user.business_id, token=token, title=body.title.strip(), description=body.description,
        discount=money(body.discount), vat_rate=body.vat_rate if body.vat_rate is not None else user.business.default_vat_rate,
        valid_until=body.valid_until, duration_min=body.duration_min or 60, notes=body.notes, active=body.active, design_style="bold",  # themed from the package text
        items=_items(body.items),
    )
    db.add(c)
    record(db, user.business_id, "campaign_created")
    db.commit()
    db.refresh(c)
    return campaign_out(db, c)


@router.get("/{cid}", response_model=s.CampaignOut)
def get_campaign(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return campaign_out(db, _get(db, cid, user.business_id))


@router.put("/{cid}", response_model=s.CampaignOut)
def update_campaign(cid: int, body: s.CampaignIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Edits apply to new acceptances; clients who already accepted keep the quote they accepted."""
    c = _get(db, cid, user.business_id)
    c.title, c.description, c.discount = body.title.strip(), body.description, money(body.discount)
    if body.vat_rate is not None:
        c.vat_rate = body.vat_rate
    c.valid_until, c.notes, c.active = body.valid_until, body.notes, body.active
    c.duration_min = body.duration_min or c.duration_min
    c.items = _items(body.items)
    db.commit()
    db.refresh(c)
    return campaign_out(db, c)


@router.get("/{cid}/responses", response_model=list[s.QuoteOut])
def responses(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from ..logic import quote_out
    _get(db, cid, user.business_id)
    rows = db.scalars(select(Quote).where(Quote.campaign_id == cid).order_by(Quote.id.desc())).all()
    return [quote_out(db, q) for q in rows]


@router.get("/{cid}/audience", response_model=s.AudienceOut)
def audience(cid: int, tag: str | None = Query(default=None, max_length=40), user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    """The clients with a tag (or all clients), each with a WhatsApp link pre-filled with this campaign."""
    from .customers import has_tag

    c = _get(db, cid, user.business_id)
    sent = dict(db.execute(select(CampaignSend.customer_id, CampaignSend.sent_at).where(CampaignSend.campaign_id == c.id)).all())
    rows = []
    for cu in db.scalars(select(Customer).where(Customer.business_id == user.business_id).order_by(Customer.name)):
        if tag and not has_tag(cu, tag):
            continue
        first = (cu.name or "").split()[0] if cu.name else ""
        rows.append(s.AudienceRow(customer_id=cu.id, name=cu.name, phone=cu.phone, tags=cu.tags or [],
                                  whatsapp_url=whatsapp_link(cu.phone, client_message(c, first)), sent_at=sent.get(cu.id)))
    return s.AudienceOut(campaign_id=c.id, title=c.title, tag=tag, rows=rows, sent=sum(1 for r in rows if r.sent_at))


@router.post("/{cid}/audience/{customer_id}/sent", status_code=204)
def mark_sent(cid: int, customer_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The owner opened WhatsApp for this client; tick them off so the list shows who is left."""
    c = _get(db, cid, user.business_id)
    get_owned(db, Customer, customer_id, user.business_id, "Customer")
    if not db.scalar(select(CampaignSend.id).where(CampaignSend.campaign_id == c.id, CampaignSend.customer_id == customer_id)):
        db.add(CampaignSend(campaign_id=c.id, customer_id=customer_id))
        record(db, user.business_id, "campaign_sent", c.title)
        db.commit()


@router.delete("/{cid}/audience/{customer_id}/sent", status_code=204)
def unmark_sent(cid: int, customer_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _get(db, cid, user.business_id)
    for row in db.scalars(select(CampaignSend).where(CampaignSend.campaign_id == c.id, CampaignSend.customer_id == customer_id)):
        db.delete(row)
    db.commit()


@router.delete("/{cid}", status_code=204)
def delete_campaign(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_get(db, cid, user.business_id))
    db.commit()


@router.patch("/{cid}/design", response_model=s.CampaignOut)
def set_design(cid: int, body: s.DesignIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Pick a banner style, or shuffle the current one (different illustration, layout and angles)."""
    c = _get(db, cid, user.business_id)
    if body.style:
        if body.style == "photo" and not c.art_id:
            raise HTTPException(409, "Create an AI picture first.")
        c.design_style = body.style
    if body.shuffle:
        c.design_seed = random.randint(1, 1_000_000)
    db.commit()
    db.refresh(c)
    return campaign_out(db, c)


@router.post("/{cid}/design/ai", response_model=s.CampaignOut)
def make_ai_art(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """One AI background picture from the package text (counts against the monthly allowance)."""
    c = _get(db, cid, user.business_id)
    try:
        art = ai_art.generate(db, c.business_id, c.id, designer.ai_prompt(c))
    except ai_art.ArtError as e:
        raise HTTPException(409, str(e))
    c.art_id, c.design_style = art.id, "photo"
    record(db, c.business_id, "campaign_ai_art", c.title)
    db.commit()
    db.refresh(c)
    return campaign_out(db, c)


@router.get("/{cid}/qr")
def campaign_qr(cid: int, fmt: str = Query(default="png", pattern="^(png|svg)$"), user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _get(db, cid, user.business_id)
    code = segno.make(campaign_url(c), error="m")
    buf = io.BytesIO()
    if fmt == "svg":
        code.save(buf, kind="svg", scale=10, border=2)
        media = "image/svg+xml"
    else:
        code.save(buf, kind="png", scale=16, border=2)
        media = "image/png"
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", c.title).strip("-") or "campaign"
    return Response(buf.getvalue(), media_type=media, headers={"Content-Disposition": f'attachment; filename="{safe}.{fmt}"'})


