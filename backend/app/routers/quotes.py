from datetime import datetime, timezone

import random

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..activity import record
from .. import schemas as s
from ..db import get_db
from ..logic import get_owned, quote_out, resolve_customer, set_lead_status
from ..models import Business, Customer, Lead, LeadStatus, Quote, QuoteItem, QuoteStatus, User
from ..pdf import quote_pdf
from ..security import current_user
from ..utils import new_token, normalize_phone, quote_label
from .. import ai_art, designer, quote_art, wa_bot, whatsapp
from ..models import CampaignArt

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
    upload = _own_upload(db, body.attachment_id, user.business_id) if body.attachment_id else None
    if not body.items and not upload:
        raise HTTPException(422, "Add at least one service with a price, or attach a picture or brochure.")
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
    db.flush()
    if upload:
        quote_art.attach(q, upload)
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
    if body.attachment_id:
        quote_art.attach(q, _own_upload(db, body.attachment_id, user.business_id))
    if not body.items and not q.file_id:
        raise HTTPException(422, "Add at least one service with a price, or attach a picture or brochure.")
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


def _own_upload(db: Session, art_id: int, business_id: int) -> CampaignArt:
    a = db.get(CampaignArt, art_id)
    if not a or a.business_id != business_id or a.kind != "upload":
        raise HTTPException(404, "That upload wasn't found. Upload the file again.")
    return a


@router.post("/{quote_id}/attachment", response_model=s.QuoteOut)
async def upload_attachment(quote_id: int, file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Attach a picture (JPG/PNG/WebP) or PDF brochure from the computer. Replaces any picture on the quote."""
    q = _get(db, quote_id, user.business_id)
    quote_art.attach(q, await quote_art.read_upload(db, user.business_id, file))
    db.commit()
    db.refresh(q)
    return quote_out(db, q)


@router.patch("/{quote_id}/design", response_model=s.QuoteOut)
def set_quote_design(quote_id: int, body: s.QuoteDesignIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """none (no picture) | bold | soft | classic | photo (needs an AI picture) | upload (needs a file); or shuffle."""
    q = _get(db, quote_id, user.business_id)
    a = quote_art.art(db, q)
    if body.style:
        if body.style == "photo" and not (a and a.kind == "ai"):
            raise HTTPException(409, "Create an AI picture first.")
        if body.style == "upload" and not q.file_id:
            raise HTTPException(409, "Upload a picture or brochure first.")
        if body.style in quote_art.BANNER_STYLES and not q.items:
            raise HTTPException(409, "Add services to the quote to make a picture from them.")
        q.design_style = body.style
    if body.shuffle:
        q.design_seed = random.randint(1, 1_000_000)
    db.commit()
    db.refresh(q)
    return quote_out(db, q)


@router.post("/{quote_id}/design/ai", response_model=s.QuoteOut)
def make_quote_ai_art(quote_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """An AI background from the quote's services (counts against the monthly allowance)."""
    q = _get(db, quote_id, user.business_id)
    if not q.items:
        raise HTTPException(409, "Add services to the quote first, so the picture knows what to show.")
    try:
        a = ai_art.generate(db, q.business_id, None, designer.ai_prompt(quote_art.as_offer(q)), quote_id=q.id)
    except ai_art.ArtError as e:
        raise HTTPException(409, str(e))
    q.art_id, q.design_style = a.id, "photo"
    record(db, q.business_id, "quote_ai_art", quote_label(q.number))
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


def _send_wa(db: Session, q: Quote) -> s.WhatsAppSendOut:
    if q.status in (QuoteStatus.accepted, QuoteStatus.rejected):
        raise HTTPException(409, f"This quote was already {q.status.value}")
    if not q.customer or not normalize_phone(q.customer.phone):
        raise HTTPException(422, "Add the client's mobile number first")
    if not whatsapp.quotes_automatic():
        out = quote_out(db, q)
        return s.WhatsAppSendOut(status="manual", whatsapp_url=out.whatsapp_url)
    m = wa_bot.send_quote(db, q)
    if m.status == "sent":
        q.shared_at = q.shared_at or datetime.now(timezone.utc)
        record(db, q.business_id, "quote_whatsapp_sent", quote_label(q.number))
    return s.WhatsAppSendOut(status=m.status, error=m.error)


@router.post("/whatsapp-bulk", response_model=s.BulkSendOut)
def send_whatsapp_bulk(body: s.BulkSendIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Send several quotes (e.g. a bulk quote) automatically, each with its own Accept button."""
    counts = {"sent": 0, "failed": 0, "manual": 0}
    for qid in dict.fromkeys(body.quote_ids):
        q = db.get(Quote, qid)
        if not q or q.business_id != user.business_id:
            continue
        try:
            counts[_send_wa(db, q).status] += 1
        except HTTPException:
            counts["failed"] += 1
    db.commit()
    return s.BulkSendOut(**counts)


@router.post("/{quote_id}/whatsapp", response_model=s.WhatsAppSendOut)
def send_whatsapp(quote_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Send the quote from the WhatsApp Business number with Accept / Decline buttons."""
    out = _send_wa(db, _get(db, quote_id, user.business_id))
    db.commit()
    return out


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
