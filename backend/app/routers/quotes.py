from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..activity import record
from .. import schemas as s
from ..db import get_db
from ..logic import get_owned, quote_out, resolve_customer, set_lead_status
from ..models import Business, Customer, Lead, LeadStatus, Quote, QuoteItem, QuoteStatus, User
from ..pdf import quote_pdf
from ..security import current_user
from ..utils import new_token, quote_label

router = APIRouter(prefix="/quotes", tags=["quotes"])

_LOAD = (
    selectinload(Quote.items),
    selectinload(Quote.views),
    selectinload(Quote.customer),
    selectinload(Quote.business),
    selectinload(Quote.service_records),
)


def _get(db: Session, quote_id: int, business_id: int) -> Quote:
    return get_owned(db, Quote, quote_id, business_id, "Quote")


def _items(body_items) -> list[QuoteItem]:
    return [
        QuoteItem(position=n, description=i.description.strip(), quantity=i.quantity, unit_price=i.unit_price)
        for n, i in enumerate(body_items)
    ]


@router.get("", response_model=list[s.QuoteOut])
def list_quotes(status: QuoteStatus | None = None, kind: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Quote).where(Quote.business_id == user.business_id).options(*_LOAD).order_by(Quote.number.desc())
    if status:
        stmt = stmt.where(Quote.status == status)
    if kind:
        stmt = stmt.where(Quote.kind == kind)
    return [quote_out(db, q) for q in db.scalars(stmt)]


@router.post("", response_model=s.QuoteOut, status_code=201)
def create_quote(body: s.QuoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Lock the business row so two quotes created at once never share a number.
    biz = db.scalar(select(Business).where(Business.id == user.business_id).with_for_update())
    lead = None
    if body.lead_id:
        lead = get_owned(db, Lead, body.lead_id, user.business_id, "Lead")
        customer = lead.customer
    else:
        customer = resolve_customer(db, user.business_id, body)
    token = new_token(10)
    while db.scalar(select(Quote.id).where(Quote.token == token)):
        token = new_token(10)
    q = Quote(
        business_id=biz.id,
        customer_id=customer.id,
        lead_id=lead.id if lead else None,
        number=biz.next_quote_number,
        token=token,
        discount=body.discount,
        vat_rate=body.vat_rate if body.vat_rate is not None else biz.default_vat_rate,
        valid_days=body.valid_days,
        notes=body.notes,
        reference=(body.reference or "").strip() or None,
        items=_items(body.items),
    )
    biz.next_quote_number += 1
    db.add(q)
    set_lead_status(db, q.lead_id, LeadStatus.quoted, only_from=(LeadStatus.new, LeadStatus.contacted))
    record(db, biz.id, "quote_created", quote_label(q.number))
    db.commit()
    db.refresh(q)
    return quote_out(db, q)


@router.post("/bulk", response_model=list[s.QuoteOut], status_code=201)
def create_bulk(body: s.BulkQuoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The same quote for many clients at once, one link each, to send on WhatsApp."""
    biz = db.scalar(select(Business).where(Business.id == user.business_id).with_for_update())
    ids = list(dict.fromkeys(body.customer_ids))
    customers = db.scalars(select(Customer).where(Customer.business_id == biz.id, Customer.id.in_(ids))).all()
    if len(customers) != len(ids):
        raise HTTPException(404, "Some clients weren't found")
    made = []
    for c in sorted(customers, key=lambda x: ids.index(x.id)):
        token = new_token(10)
        while db.scalar(select(Quote.id).where(Quote.token == token)):
            token = new_token(10)
        q = Quote(
            business_id=biz.id, customer_id=c.id, number=biz.next_quote_number, token=token, discount=body.discount,
            vat_rate=body.vat_rate if body.vat_rate is not None else biz.default_vat_rate, valid_days=body.valid_days,
            notes=body.notes, reference=(body.reference or "").strip() or None, items=_items(body.items),
        )
        biz.next_quote_number += 1
        db.add(q)
        made.append(q)
    record(db, biz.id, "quote_created", f"{len(made)} quotes (bulk)")
    db.commit()
    for q in made:
        db.refresh(q)
    return [quote_out(db, q) for q in made]


@router.get("/{quote_id}", response_model=s.QuoteOut)
def get_quote(quote_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return quote_out(db, _get(db, quote_id, user.business_id))


@router.put("/{quote_id}", response_model=s.QuoteOut)
def update_quote(quote_id: int, body: s.QuoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Edit items/prices while the customer hasn't decided. The link stays the same."""
    q = _get(db, quote_id, user.business_id)
    if q.status in (QuoteStatus.accepted, QuoteStatus.rejected):
        raise HTTPException(409, f"{quote_label(q.number)} has already been {q.status.value}. Create a new quote instead.")
    if body.customer_id or body.new_customer:
        q.customer_id = resolve_customer(db, user.business_id, body).id
    q.items = _items(body.items)
    q.discount = body.discount
    if body.vat_rate is not None:
        q.vat_rate = body.vat_rate
    q.valid_days = body.valid_days
    q.notes = body.notes
    q.reference = (body.reference or "").strip() or None
    db.commit()
    db.refresh(q)
    return quote_out(db, q)


@router.post("/{quote_id}/shared", response_model=s.QuoteOut)
def mark_shared(quote_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The owner sent it (WhatsApp, copied the link or downloaded the PDF): no longer "Ready to send"."""
    q = _get(db, quote_id, user.business_id)
    if not q.shared_at:
        q.shared_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(q)
    return quote_out(db, q)


@router.post("/{quote_id}/decision", response_model=s.QuoteOut)
def record_decision(quote_id: int, accepted: bool, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """For when the customer accepts by phone or in person instead of on the link."""
    q = _get(db, quote_id, user.business_id)
    apply_decision(db, q, accepted)
    db.commit()
    db.refresh(q)
    return quote_out(db, q)


def apply_decision(db: Session, q: Quote, accepted: bool) -> None:
    q.status = QuoteStatus.accepted if accepted else QuoteStatus.rejected
    q.decided_at = datetime.now(timezone.utc)
    q.shared_at = q.shared_at or q.decided_at
    record(db, q.business_id, "quote_accepted" if accepted else "quote_declined", quote_label(q.number))
    set_lead_status(db, q.lead_id, LeadStatus.won if accepted else LeadStatus.lost)
    if accepted and not q.booking_status:
        booked = any(x.status.value not in ("cancelled", "no_show") for x in q.appointments)
        q.booking_status = "confirmed" if booked else "awaiting"


@router.delete("/{quote_id}", status_code=204)
def delete_quote(quote_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_get(db, quote_id, user.business_id))
    db.commit()


@router.get("/{quote_id}/pdf")
def download_pdf(quote_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, quote_id, user.business_id)
    return Response(
        quote_pdf(q),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{quote_label(q.number)}.pdf"'},
    )
