from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..activity import record
from .. import schemas as s
from ..db import get_db
from ..logic import get_owned, resolve_customer, service_out
from ..models import Quote, QuoteStatus, ServiceRecord, User
from ..security import current_user
from ..utils import add_months, new_token, whatsapp_link

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[s.ServiceOut])
def list_services(
    due_within_days: int | None = Query(default=None, ge=0, le=365),
    customer_id: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(ServiceRecord)
        .where(ServiceRecord.business_id == user.business_id)
        .options(joinedload(ServiceRecord.customer))
        .order_by(ServiceRecord.service_date.desc(), ServiceRecord.id.desc())
    )
    if customer_id:
        stmt = stmt.where(ServiceRecord.customer_id == customer_id)
    if due_within_days is not None:
        stmt = stmt.where(
            ServiceRecord.next_service_date.is_not(None),
            ServiceRecord.next_service_date <= date.today() + timedelta(days=due_within_days),
        ).order_by(None).order_by(ServiceRecord.next_service_date)
    return [service_out(r) for r in db.scalars(stmt)]


@router.post("", response_model=s.ServiceOut, status_code=201)
def create_service(body: s.ServiceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    quote = None
    if body.quote_id:
        quote = get_owned(db, Quote, body.quote_id, user.business_id, "Quote")
        if quote.status != QuoteStatus.accepted:
            raise HTTPException(409, "Only accepted quotes can become service records")
        customer = quote.customer
    else:
        customer = resolve_customer(db, user.business_id, body)
    next_date = body.next_service_date
    if not next_date and body.next_service_months:
        next_date = add_months(body.service_date, body.next_service_months)
    token = new_token(8)
    while db.scalar(select(ServiceRecord.id).where(ServiceRecord.token == token)):
        token = new_token(8)
    r = ServiceRecord(
        business_id=user.business_id,
        customer_id=customer.id,
        quote_id=body.quote_id,
        token=token,
        service=body.service.strip(),
        service_date=body.service_date,
        amount=body.amount,
        technician=body.technician,
        notes=body.notes,
        reference=(body.reference or "").strip() or (quote.reference if quote else None) or None,
        next_service_date=next_date,
    )
    db.add(r)
    record(db, user.business_id, "service_recorded")
    db.commit()
    db.refresh(r)
    return service_out(r)


@router.patch("/{service_id}", response_model=s.ServiceOut)
def update_service(service_id: int, body: s.ServiceUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = get_owned(db, ServiceRecord, service_id, user.business_id, "Service record")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return service_out(r)


@router.post("/{service_id}/reminder", response_model=s.ReminderOut)
def reminder(service_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Builds a ready-to-send WhatsApp reminder and records that it went out.
    The owner taps the link to send it from their own WhatsApp."""
    r = get_owned(db, ServiceRecord, service_id, user.business_id, "Service record")
    first = r.customer.name.split()[0] if r.customer.name else ""
    when = f" on {r.next_service_date:%d %b}" if r.next_service_date else ""
    msg = (
        f"Hi {first}, this is {user.business.name}. It's almost time for your next {r.service}{when}. "
        f"Reply here and we'll book you in. Your visits: {service_out(r).public_url}"
    )
    r.reminder_sent_at = datetime.now(timezone.utc)
    record(db, user.business_id, "reminder_sent")
    db.commit()
    return s.ReminderOut(whatsapp_url=whatsapp_link(r.customer.phone, msg), message=msg)
