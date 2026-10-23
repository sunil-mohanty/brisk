"""The salon team: stylists, barbers, nail techs and therapists clients can book."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..logic import get_owned
from ..models import Stylist, User
from ..security import current_user

router = APIRouter(prefix="/team", tags=["team"])

# Warm, distinguishable diary colours that sit well on cream.
PALETTE = ["#b4532f", "#5e7a5a", "#8a5a83", "#c28a3a", "#3f6f8a", "#a8484f", "#6b6f3a", "#7a5136"]


@router.get("", response_model=list[s.StylistOut])
def list_team(include_inactive: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Stylist).where(Stylist.business_id == user.business_id).order_by(Stylist.position, Stylist.id)
    if not include_inactive:
        stmt = stmt.where(Stylist.active.is_(True))
    return db.scalars(stmt).all()


@router.post("", response_model=s.StylistOut, status_code=201)
def add_member(body: s.StylistIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    count = db.scalar(select(func.count(Stylist.id)).where(Stylist.business_id == user.business_id)) or 0
    m = Stylist(
        business_id=user.business_id,
        name=body.name.strip(),
        role=(body.role or "").strip() or None,
        color=body.color or PALETTE[count % len(PALETTE)],
        on_page=body.on_page,
        position=count,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.patch("/{member_id}", response_model=s.StylistOut)
def update_member(member_id: int, body: s.StylistUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = get_owned(db, Stylist, member_id, user.business_id, "Team member")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{member_id}", status_code=204)
def remove_member(member_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Past appointments keep their history; the stylist is just no longer bookable."""
    m = get_owned(db, Stylist, member_id, user.business_id, "Team member")
    m.active = False
    m.on_page = False
    db.commit()
