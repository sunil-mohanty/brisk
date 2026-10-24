"""Booking confirmations the system couldn't send itself (WhatsApp not connected, or a send failed)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..logic import get_owned
from ..models import OutboundMessage, User
from ..security import current_user
from ..utils import whatsapp_link

router = APIRouter(prefix="/messages", tags=["messages"])


def message_out(m: OutboundMessage) -> s.OutboundOut:
    o = s.OutboundOut.model_validate(m)
    o.whatsapp_url = whatsapp_link(m.to_phone, m.body)
    return o


@router.get("/pending", response_model=list[s.OutboundOut])
def pending(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(OutboundMessage).where(OutboundMessage.business_id == user.business_id, OutboundMessage.status.in_(("manual", "failed")), OutboundMessage.kind != "bot")
        .order_by(OutboundMessage.id)
    ).all()
    return [message_out(m) for m in rows]


@router.post("/{msg_id}/done", status_code=204)
def mark_done(msg_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The owner sent it from their own WhatsApp."""
    get_owned(db, OutboundMessage, msg_id, user.business_id, "Message").status = "done"
    db.commit()
