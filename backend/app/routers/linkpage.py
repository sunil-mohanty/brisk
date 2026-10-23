"""The owner's side of the link-in-bio page: address, bio, socials, buttons, look and stats."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..activity import record
from ..db import get_db
from ..logic import clean_handle, clean_slug, get_owned, link_page_url
from ..models import Business, Lead, LinkClick, LinkItem, User
from ..security import current_user

router = APIRouter(prefix="/linkpage", tags=["link page"])
MAX_LINKS = 12
LINK_PAGE_SOURCE = "Link page"


def _links(db: Session, business_id: int) -> list[LinkItem]:
    return db.scalars(select(LinkItem).where(LinkItem.business_id == business_id).order_by(LinkItem.position, LinkItem.id)).all()


def _out(db: Session, b: Business) -> s.LinkPageOut:
    week = datetime.now(timezone.utc) - timedelta(days=7)
    taps = dict(
        db.execute(
            select(LinkClick.kind, func.count())
            .where(LinkClick.business_id == b.id, LinkClick.created_at >= week)
            .group_by(LinkClick.kind)
        ).all()
    )
    views_7d = taps.pop("view", 0)
    bookings = db.scalar(
        select(func.count(Lead.id)).where(
            Lead.business_id == b.id, Lead.source == LINK_PAGE_SOURCE,
            Lead.created_at >= datetime.now(timezone.utc) - timedelta(days=30),
        )
    ) or 0
    return s.LinkPageOut(
        slug=b.slug, url=link_page_url(b), bio=b.bio, instagram=b.instagram, tiktok=b.tiktok, snapchat=b.snapchat,
        facebook=b.facebook, maps_url=b.maps_url, hours=b.hours, link_theme=b.link_theme or "clay",
        link_motion=b.link_motion or "bloom", link_show_prices=b.link_show_prices, link_booking=b.link_booking,
        links=[s.LinkItemOut.model_validate(x) for x in _links(db, b.id)],
        views=b.link_views or 0, views_7d=views_7d, taps_7d=taps, bookings_30d=bookings,
    )


@router.get("", response_model=s.LinkPageOut)
def get_page(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(db, user.business)


@router.patch("", response_model=s.LinkPageOut)
def update_page(body: s.LinkPageUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = user.business
    changes = body.model_dump(exclude_unset=True)
    if "slug" in changes:
        if not changes["slug"]:
            raise HTTPException(422, "Your page needs an address")
        slug = clean_slug(changes["slug"])
        taken = db.scalar(select(Business.id).where(Business.slug == slug, Business.id != b.id))
        if taken:
            raise HTTPException(409, "That address is taken. Try adding your area, e.g. layla-beauty-barsha")
        changes["slug"] = slug
    for k in ("instagram", "tiktok", "snapchat"):
        if k in changes:
            changes[k] = clean_handle(changes[k])
    if changes.get("link_theme") is not None and changes["link_theme"] not in s.LINK_THEMES:
        raise HTTPException(422, "Unknown colour theme")
    if changes.get("link_motion") is not None and changes["link_motion"] not in s.LINK_MOTIONS:
        raise HTTPException(422, "Unknown animation style")
    for k, v in changes.items():
        if v is None and k in ("link_theme", "link_motion", "link_show_prices", "link_booking"):
            continue
        setattr(b, k, v.strip() or None if isinstance(v, str) and k not in ("slug", "link_theme", "link_motion") else v)
    record(db, b.id, "link_page_updated")
    db.commit()
    db.refresh(b)
    return _out(db, b)


@router.post("/links", response_model=s.LinkPageOut, status_code=201)
def add_link(body: s.LinkItemIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    existing = _links(db, user.business_id)
    if len(existing) >= MAX_LINKS:
        raise HTTPException(409, f"You can have up to {MAX_LINKS} buttons. Remove one first.")
    db.add(LinkItem(business_id=user.business_id, label=body.label.strip(), url=body.url, highlight=body.highlight, position=len(existing)))
    db.commit()
    return _out(db, user.business)


@router.patch("/links/{link_id}", response_model=s.LinkPageOut)
def update_link(link_id: int, body: s.LinkItemUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = get_owned(db, LinkItem, link_id, user.business_id, "Link")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(item, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return _out(db, user.business)


@router.post("/links/order", response_model=s.LinkPageOut)
def reorder(ids: list[int], user: User = Depends(current_user), db: Session = Depends(get_db)):
    pos = {i: n for n, i in enumerate(ids)}
    for item in _links(db, user.business_id):
        if item.id in pos:
            item.position = pos[item.id]
    db.commit()
    return _out(db, user.business)


@router.delete("/links/{link_id}", response_model=s.LinkPageOut)
def delete_link(link_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, LinkItem, link_id, user.business_id, "Link"))
    db.commit()
    return _out(db, user.business)
