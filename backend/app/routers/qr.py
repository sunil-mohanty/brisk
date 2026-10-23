import io
import re

import segno
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..activity import record
from .. import schemas as s
from ..db import get_db
from ..logic import get_owned, qr_target
from ..models import Lead, QRCode, User
from ..security import current_user
from ..utils import new_token

router = APIRouter(prefix="/qr", tags=["qr"])


def _out(qr: QRCode, leads: int) -> s.QROut:
    out = s.QROut.model_validate(qr)
    out.leads = leads
    out.target_url = qr_target(qr.code)
    return out


def _lead_counts(db: Session, business_id: int) -> dict[int, int]:
    rows = db.execute(
        select(Lead.qr_id, func.count()).where(Lead.business_id == business_id, Lead.qr_id.is_not(None)).group_by(Lead.qr_id)
    )
    return dict(rows.all())


@router.get("", response_model=list[s.QROut])
def list_qr(include_archived: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(QRCode).where(QRCode.business_id == user.business_id).order_by(QRCode.created_at.desc())
    if not include_archived:
        stmt = stmt.where(QRCode.archived.is_(False))
    counts = _lead_counts(db, user.business_id)
    return [_out(q, counts.get(q.id, 0)) for q in db.scalars(stmt)]


@router.post("", response_model=s.QROut, status_code=201)
def create_qr(body: s.QRIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    code = new_token(6)
    while db.scalar(select(QRCode.id).where(QRCode.code == code)):
        code = new_token(6)
    qr = QRCode(business_id=user.business_id, code=code, **body.model_dump())
    db.add(qr)
    record(db, user.business_id, "qr_created", qr.name)
    db.commit()
    return _out(qr, 0)


@router.patch("/{qr_id}", response_model=s.QROut)
def update_qr(qr_id: int, body: s.QRUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    qr = get_owned(db, QRCode, qr_id, user.business_id, "QR code")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(qr, k, v)
    db.commit()
    return _out(qr, _lead_counts(db, user.business_id).get(qr.id, 0))


@router.get("/{qr_id}/image")
def qr_image(
    qr_id: int,
    fmt: str = Query(default="png", pattern="^(png|svg)$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Print-ready QR. Generated on request, so there is nothing to store."""
    qr = get_owned(db, QRCode, qr_id, user.business_id, "QR code")
    code = segno.make(qr_target(qr.code), error="m")
    buf = io.BytesIO()
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", qr.name).strip("-") or "qr"
    if fmt == "svg":
        code.save(buf, kind="svg", scale=10, border=2)
        media = "image/svg+xml"
    else:
        code.save(buf, kind="png", scale=16, border=2)
        media = "image/png"
    return Response(
        buf.getvalue(),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="qr-{safe}.{fmt}"'},
    )
