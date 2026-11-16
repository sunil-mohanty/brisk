from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import schemas as s
from ..db import get_db
from ..logic import get_owned, resolve_customer
from ..models import Appointment, Lead, LeadStatus, Quote, QuoteStatus, User
from ..utils import quote_label, quote_totals
from ..security import current_user

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("", response_model=list[s.LeadOut])
def list_leads(status: LeadStatus | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = (
        select(Lead)
        .where(Lead.business_id == user.business_id)
        .options(joinedload(Lead.customer))
        .order_by(Lead.created_at.desc())
    )
    if status:
        stmt = stmt.where(Lead.status == status)
    leads = db.scalars(stmt).all()
    return _with_bookings(db, user.business_id, leads)


def _with_bookings(db: Session, business_id: int, leads) -> list[s.LeadOut]:
    """Adds the appointment booked from each lead, so the list can show "Booked" instead of "Book"."""
    ids = [l.id for l in leads]
    booked = dict(
        db.execute(
            select(Appointment.lead_id, Appointment.id)
            .where(Appointment.business_id == business_id, Appointment.lead_id.in_(ids))
            .order_by(Appointment.id)
        ).all()
    ) if ids else {}
    # The offer each lead accepted (campaign or quote), newest first
    offers: dict[int, Quote] = {}
    if ids:
        for q in db.scalars(select(Quote).where(Quote.business_id == business_id, Quote.lead_id.in_(ids)).order_by(Quote.id.desc())):
            offers.setdefault(q.lead_id, q)
    out = []
    for l in leads:
        o = s.LeadOut.model_validate(l)
        o.appointment_id = booked.get(l.id)
        q = offers.get(l.id)
        if q:
            o.quote_id, o.quote_label = q.id, quote_label(q.number)
            o.offer = q.reference or " + ".join(i.description for i in q.items)
            o.offer_total = quote_totals(q.items, q.discount, q.vat_rate).total
            if q.status == QuoteStatus.accepted:
                o.accepted_via = "WhatsApp" if "(WhatsApp)" in (l.requirement or "") else "Offer page" if q.kind == "campaign" else "Quote"
        out.append(o)
    return out


@router.post("", response_model=s.LeadOut, status_code=201)
def create_lead(body: s.LeadIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    customer = resolve_customer(db, user.business_id, body)
    lead = Lead(
        business_id=user.business_id, customer_id=customer.id, source=body.source, requirement=body.requirement,
        service_interest=body.service_interest, preferred_date=body.preferred_date, preferred_time=body.preferred_time,
        stylist_pref=body.stylist_pref,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.patch("/{lead_id}", response_model=s.LeadOut)
def update_lead(lead_id: int, body: s.LeadUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    lead = get_owned(db, Lead, lead_id, user.business_id, "Lead")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(lead, k, v)
    db.commit()
    db.refresh(lead)
    return lead


@router.delete("/{lead_id}", status_code=204)
def delete_lead(lead_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    lead = get_owned(db, Lead, lead_id, user.business_id, "Lead")
    db.delete(lead)
    db.commit()
