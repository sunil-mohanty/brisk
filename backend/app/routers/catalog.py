"""Service menu: what the salon offers, with price and time. Used on quotes, bookings and the link page."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..logic import get_owned
from ..models import CatalogItem, User
from ..security import current_user
from ..utils import money

router = APIRouter(prefix="/catalog", tags=["catalog"])
MAX_ITEMS = 300


@router.get("", response_model=list[s.CatalogOut])
def list_items(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(CatalogItem).where(CatalogItem.business_id == user.business_id)
        .order_by(CatalogItem.category.is_(None), CatalogItem.category, CatalogItem.uses.desc(), func.lower(CatalogItem.name))
    ).all()


@router.post("", response_model=list[s.CatalogOut], status_code=201)
def add_items(body: list[s.CatalogIn], user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Adds lines; a name that already exists updates its price instead of duplicating."""
    existing = {c.name.strip().lower(): c for c in db.scalars(select(CatalogItem).where(CatalogItem.business_id == user.business_id))}
    for item in body[:MAX_ITEMS]:
        key = item.name.strip().lower()
        if key in existing:
            existing[key].unit_price = money(item.unit_price)
            if item.category:
                existing[key].category = item.category.strip()
            if item.duration_min:
                existing[key].duration_min = item.duration_min
        elif len(existing) < MAX_ITEMS:
            c = CatalogItem(
                business_id=user.business_id, name=item.name.strip(), unit_price=money(item.unit_price),
                category=(item.category or "").strip() or None, duration_min=item.duration_min,
            )
            db.add(c)
            existing[key] = c
    db.commit()
    return list_items(user, db)


@router.post("/used", status_code=204)
def mark_used(names: list[str], user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Counts which lines go into quotes, so the most used appear first."""
    wanted = {n.strip().lower() for n in names[:50]}
    for c in db.scalars(select(CatalogItem).where(CatalogItem.business_id == user.business_id)):
        if c.name.strip().lower() in wanted:
            c.uses += 1
    db.commit()


@router.patch("/{item_id}", response_model=s.CatalogOut)
def update_item(item_id: int, body: s.CatalogUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_owned(db, CatalogItem, item_id, user.business_id, "Price list item")
    for k, v in body.model_dump(exclude_unset=True).items():
        if k == "category":
            v = (v or "").strip() or None
        setattr(c, k, v.strip() if isinstance(v, str) else money(v) if k == "unit_price" else v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, CatalogItem, item_id, user.business_id, "Price list item"))
    db.commit()
