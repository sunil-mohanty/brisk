"""Campaign quotes: one public offer for social media, YouTube and ads. Each client who accepts
gets their own accepted quote (and appointment, if they book a time)."""

import io
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
from .. import creative, social, whatsapp
from ..logic import get_owned, item_out
from ..models import Campaign, CampaignItem, Quote, User
from ..security import current_user
from ..utils import money, new_token, quote_totals

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
    )


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
        valid_until=body.valid_until, duration_min=body.duration_min or 60, notes=body.notes, active=body.active,
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


@router.delete("/{cid}", status_code=204)
def delete_campaign(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_get(db, cid, user.business_id))
    db.commit()


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


