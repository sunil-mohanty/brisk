"""Stock the salon keeps: colour, developer, retail products, consumables."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..logic import get_owned
from ..models import InventoryItem, StockMove, User
from ..security import current_user

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _out(i: InventoryItem) -> s.InventoryOut:
    o = s.InventoryOut.model_validate(i)
    o.low = i.low_stock > 0 and i.stock <= i.low_stock
    return o


@router.get("", response_model=list[s.InventoryOut])
def list_items(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(InventoryItem).where(InventoryItem.business_id == user.business_id)
        .order_by(InventoryItem.category.is_(None), InventoryItem.category, func.lower(InventoryItem.name))
    ).all()
    return [_out(i) for i in rows]


@router.post("", response_model=s.InventoryOut, status_code=201)
def add_item(body: s.InventoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    for k in ("category", "sku", "supplier"):
        data[k] = (data[k] or "").strip() or None
    i = InventoryItem(business_id=user.business_id, **data)
    db.add(i)
    db.flush()
    if body.stock:
        db.add(StockMove(business_id=user.business_id, item_id=i.id, change=body.stock, reason="received", note="Opening stock"))
    db.commit()
    db.refresh(i)
    return _out(i)


@router.patch("/{item_id}", response_model=s.InventoryOut)
def update_item(item_id: int, body: s.InventoryUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    i = get_owned(db, InventoryItem, item_id, user.business_id, "Product")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(i, k, (v.strip() or None) if isinstance(v, str) and k != "name" else v)
    db.commit()
    db.refresh(i)
    return _out(i)


@router.post("/{item_id}/move", response_model=s.InventoryOut)
def move_stock(item_id: int, body: s.StockMoveIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """received: +qty · used / sold: -qty · adjust: set the counted amount (change = new total)."""
    i = get_owned(db, InventoryItem, item_id, user.business_id, "Product")
    if body.reason == "adjust":
        delta = body.change - i.stock
    else:
        qty = abs(body.change)
        if qty == 0:
            raise HTTPException(422, "Enter a quantity")
        delta = qty if body.reason == "received" else -qty
    i.stock = i.stock + delta
    db.add(StockMove(business_id=user.business_id, item_id=i.id, change=delta, reason=body.reason, note=body.note))
    db.commit()
    db.refresh(i)
    return _out(i)


@router.get("/{item_id}/moves", response_model=list[s.StockMoveOut])
def moves(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_owned(db, InventoryItem, item_id, user.business_id, "Product")
    return db.scalars(select(StockMove).where(StockMove.item_id == item_id).order_by(StockMove.id.desc()).limit(100)).all()


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, InventoryItem, item_id, user.business_id, "Product"))
    db.commit()
