from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import schemas as s
from .. import whatsapp
from ..db import get_db
from ..logic import get_owned, resolve_customer
from ..models import Appointment, Lead, LeadStatus, OutboundMessage, Quote, QuoteStatus, User, WhatsAppInbound, utcnow
from ..utils import normalize_phone, quote_label, quote_totals
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
    out = _with_bookings(db, user.business_id, leads)
    # Newest activity first: a new WhatsApp message brings its lead to the top
    out.sort(key=lambda o: max(_utc(o.created_at), o.last_message_at or _utc(o.created_at)), reverse=True)
    return out


def _inbound(db: Session, business_id: int):
    """Messages clients wrote to this salon, oldest first, by WhatsApp number."""
    by: dict[str, list[WhatsAppInbound]] = {}
    for m in db.scalars(select(WhatsAppInbound).where(WhatsAppInbound.business_id == business_id, WhatsAppInbound.kind == "text")
                        .order_by(WhatsAppInbound.id)):
        by.setdefault(m.from_phone, []).append(m)
    return by


@router.get("/unread")
def unread(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """How many leads have WhatsApp messages the salon hasn't opened (for the badge in the menu)."""
    return {"count": sum(1 for o in list_leads(None, user, db) if o.unread)}


def _utc(dt):
    """Database times can come back naive (SQLite) or aware (Postgres): make them all aware UTC."""
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def _thread(db: Session, lead: Lead) -> list[s.ChatMessageOut]:
    phone = normalize_phone(lead.customer.phone) if lead.customer.phone else None
    if not phone:
        return []
    msgs = [s.ChatMessageOut(id=f"i{m.id}", dir="in", text=m.body or m.payload or "", at=_utc(m.created_at))
            for m in db.scalars(select(WhatsAppInbound).where(WhatsAppInbound.business_id == lead.business_id,
                                                               WhatsAppInbound.from_phone == phone).order_by(WhatsAppInbound.id))
            if (m.body or m.payload)]
    for m in db.scalars(select(OutboundMessage).where(OutboundMessage.business_id == lead.business_id).order_by(OutboundMessage.id)):
        if normalize_phone(m.to_phone) == phone:
            msgs.append(s.ChatMessageOut(id=f"o{m.id}", dir="out", text=m.body, at=_utc(m.created_at), kind=m.kind, status=m.status, error=m.error))
    msgs.sort(key=lambda x: x.at)
    return msgs[-200:]


def _chat(db: Session, lead: Lead) -> s.ChatOut:
    msgs = _thread(db, lead)
    last_in = max((m.at for m in msgs if m.dir == "in"), default=None)
    ends = last_in + timedelta(hours=24) if last_in else None
    return s.ChatOut(lead_id=lead.id, name=lead.customer.name, phone=lead.customer.phone, messages=msgs,
                     can_reply=bool(ends and ends > utcnow()), connected=whatsapp.automatic(), window_ends_at=ends)


@router.get("/{lead_id}/chat", response_model=s.ChatOut)
def get_chat(lead_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The WhatsApp conversation with this lead's client. Opening it marks their messages as read."""
    lead = get_owned(db, Lead, lead_id, user.business_id, "Lead")
    lead.chat_seen_at = utcnow()
    db.commit()
    return _chat(db, lead)


@router.post("/{lead_id}/chat", response_model=s.ChatOut)
def send_chat(lead_id: int, body: s.ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Reply to the client on WhatsApp from the Business number (allowed within 24 hours of their last message)."""
    lead = get_owned(db, Lead, lead_id, user.business_id, "Lead")
    phone = normalize_phone(lead.customer.phone) if lead.customer.phone else None
    if not phone:
        raise HTTPException(422, "This client has no mobile number.")
    if not whatsapp.automatic():
        raise HTTPException(409, "The WhatsApp Business number isn't connected. Use the WhatsApp button to message from your phone.")
    chat = _chat(db, lead)
    if not chat.can_reply:
        raise HTTPException(409, f"It's been more than 24 hours since {lead.customer.name.split()[0]} last wrote, so WhatsApp "
                                 "doesn't allow a free reply from the Business number. Call them, or use the WhatsApp button "
                                 "to message from your own phone.")
    m = whatsapp.reply_text(db, business_id=lead.business_id, to=phone, body=body.text.strip(), kind="chat")
    if lead.status == LeadStatus.new:
        lead.status = LeadStatus.contacted
    lead.chat_seen_at = utcnow()
    db.commit()
    if m is not None and m.status == "failed":
        raise HTTPException(502, f"WhatsApp didn't take it: {m.error or 'unknown error'}")
    return _chat(db, lead)


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
    # WhatsApp messages: shown on each client's newest lead
    inbound = _inbound(db, business_id)
    newest: dict[int, int] = {}
    for l in leads:
        newest[l.customer_id] = max(newest.get(l.customer_id, 0), l.id)
    out = []
    for l in leads:
        o = s.LeadOut.model_validate(l)
        o.appointment_id = booked.get(l.id)
        phone = normalize_phone(l.customer.phone) if l.customer.phone else None
        msgs = inbound.get(phone or "-") if newest.get(l.customer_id) == l.id else None
        if msgs:
            last = msgs[-1]
            o.last_message, o.last_message_at = (last.body or last.payload or "")[:200], _utc(last.created_at)
            seen, made = _utc(l.chat_seen_at), _utc(l.created_at)
            o.unread = sum(1 for m in msgs if (seen is None and _utc(m.created_at) >= made - timedelta(minutes=1)) or (seen and _utc(m.created_at) > seen))
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
