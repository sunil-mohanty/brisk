from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import schemas as s
from .. import social_bot, whatsapp
from ..db import get_db
from ..logic import get_owned, resolve_customer
from ..models import (Appointment, Campaign, Lead, LeadStatus, OutboundMessage, Quote, QuoteStatus, SocialEvent, SocialPerson, User,
                      WhatsAppInbound, utcnow)
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


SOCIAL_IN = ("comment", "reaction", "message_in")
LABEL = {"facebook": "Facebook", "instagram": "Instagram", "whatsapp": "WhatsApp"}


def _people(db: Session, lead: Lead) -> list[SocialPerson]:
    return db.scalars(select(SocialPerson).where(SocialPerson.business_id == lead.business_id,
                                                 SocialPerson.customer_id == lead.customer_id).order_by(SocialPerson.id)).all()


def _social_msgs(db: Session, people: list[SocialPerson]) -> list[s.ChatMessageOut]:
    if not people:
        return []
    titles: dict[int, str] = {}
    out = []
    for e in db.scalars(select(SocialEvent).where(SocialEvent.person_id.in_([p.id for p in people])).order_by(SocialEvent.id)):
        if e.campaign_id and e.campaign_id not in titles:
            titles[e.campaign_id] = db.scalar(select(Campaign.title).where(Campaign.id == e.campaign_id)) or "campaign"
        on = f"your campaign \"{titles[e.campaign_id]}\"" if e.campaign_id else "a post"
        if e.kind == "comment":
            m = s.ChatMessageOut(id=f"s{e.id}", dir="in", text=e.text or "", at=_utc(e.created_at), note=f"Comment on {on}")
        elif e.kind == "reaction":
            m = s.ChatMessageOut(id=f"s{e.id}", dir="in", text=f"Reacted to {on} ({e.text or 'like'})", at=_utc(e.created_at), note="Reaction")
        elif e.kind == "message_in":
            m = s.ChatMessageOut(id=f"s{e.id}", dir="in", text=e.text or "", at=_utc(e.created_at))
        else:  # message_out | private_reply | comment_reply
            m = s.ChatMessageOut(id=f"s{e.id}", dir="out", text=e.text or "", at=_utc(e.created_at),
                                 kind={"private_reply": "private_reply", "comment_reply": "public_reply"}.get(e.kind)
                                 or ("auto_reply" if e.status == "auto" else "chat"),
                                 status="failed" if e.status == "failed" else "sent", error=e.error)
        m.channel = e.provider
        out.append(m)
    return out


def _thread(db: Session, lead: Lead, people: list[SocialPerson] | None = None) -> list[s.ChatMessageOut]:
    social = _social_msgs(db, _people(db, lead) if people is None else people)
    phone = normalize_phone(lead.customer.phone) if lead.customer.phone else None
    if not phone:
        return social[-200:]
    msgs = social + [s.ChatMessageOut(id=f"i{m.id}", dir="in", text=m.body or m.payload or "", at=_utc(m.created_at))
            for m in db.scalars(select(WhatsAppInbound).where(WhatsAppInbound.business_id == lead.business_id,
                                                               WhatsAppInbound.from_phone == phone).order_by(WhatsAppInbound.id))
            if (m.body or m.payload)]
    for m in db.scalars(select(OutboundMessage).where(OutboundMessage.business_id == lead.business_id).order_by(OutboundMessage.id)):
        if normalize_phone(m.to_phone) == phone:
            msgs.append(s.ChatMessageOut(id=f"o{m.id}", dir="out", text=m.body, at=_utc(m.created_at), kind=m.kind, status=m.status, error=m.error))
    msgs.sort(key=lambda x: x.at)
    return msgs[-200:]


def _chat(db: Session, lead: Lead) -> s.ChatOut:
    people = _people(db, lead)
    msgs = _thread(db, lead, people)
    last_in = max((m.at for m in msgs if m.dir == "in" and m.channel == "whatsapp"), default=None)
    ends = last_in + timedelta(hours=24) if last_in else None
    can = bool(ends and ends > utcnow())
    channels: list[tuple[object, s.ChatChannel]] = []
    if lead.customer.phone:
        channels.append((last_in, s.ChatChannel(channel="whatsapp", label="WhatsApp", can_reply=can and whatsapp.automatic(),
                                                how="dm" if can else None, until=ends if can else None)))
    for p in people:
        how, until = social_bot.reply_state(db, p)
        who = f"@{p.username}" if p.username else (p.name or "")
        latest = max((m.at for m in msgs if m.dir == "in" and m.channel == p.provider), default=None)
        talked = any(m.dir == "in" and m.channel == p.provider and m.note != "Reaction" for m in msgs)
        hint = None if how else (f"{LABEL[p.provider]} allows one private message per comment. You can message them again "
                                 "as soon as they reply to it, for 24 hours after each of their messages."
                                 if p.msg_id or talked else None)
        lc = social_bot.last_comment(db, p)
        channels.append((latest, s.ChatChannel(channel=p.provider, label=f"{LABEL[p.provider]} {who}".strip(), can_reply=bool(how),
                                               how=how, until=_utc(until) if until else None, hint=hint,
                                               comment=(lc.text or "")[:200] if lc else None)))
    channels.sort(key=lambda x: x[0] or _utc(lead.created_at).replace(year=1970), reverse=True)
    return s.ChatOut(lead_id=lead.id, name=lead.customer.name, phone=lead.customer.phone, messages=msgs,
                     can_reply=can, connected=whatsapp.automatic(), window_ends_at=ends,
                     channels=[c for _, c in channels], channel=channels[0][1].channel if channels else "whatsapp")


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
    if body.channel != "whatsapp":
        return _send_social(db, lead, body)
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


def _send_social(db: Session, lead: Lead, body: s.ChatIn) -> s.ChatOut:
    """Reply on Facebook / Instagram: a message within 24 hours of theirs, or the one private reply to their comment."""
    p = next((x for x in _people(db, lead) if x.provider == body.channel), None)
    if not p:
        raise HTTPException(422, f"{lead.customer.name.split()[0]} hasn't written on {LABEL[body.channel]}.")
    try:
        ev = social_bot.send_from_chat(db, p, body.text.strip(), public=body.public)
    except social_bot.SendError as e:
        if str(e) == "closed":
            raise HTTPException(409, f"{LABEL[p.provider]} only allows a reply within 24 hours of their last message, or one "
                                     "private reply to a comment within 7 days. Reply to them in the Meta Business Suite app, "
                                     "or wait until they write again.")
        raise HTTPException(409, str(e))
    if lead.status == LeadStatus.new:
        lead.status = LeadStatus.contacted
    lead.chat_seen_at = utcnow()
    db.commit()
    if ev.status == "failed":
        raise HTTPException(502, f"{LABEL[p.provider]} didn't take it: {ev.error or 'unknown error'}")
    return _chat(db, lead)


def _social_inbound(db: Session, business_id: int) -> dict[int, list[tuple]]:
    """Comments, reactions and messages from Facebook / Instagram by client: [(at, text, provider, handle)], oldest first."""
    people = {p.id: p for p in db.scalars(select(SocialPerson).where(SocialPerson.business_id == business_id))}
    by: dict[int, list[tuple]] = {}
    if not people:
        return by
    for e in db.scalars(select(SocialEvent).where(SocialEvent.business_id == business_id, SocialEvent.kind.in_(SOCIAL_IN))
                        .order_by(SocialEvent.id)):
        p = people.get(e.person_id)
        if not p or not p.customer_id:
            continue
        text = (e.text or "") if e.kind != "reaction" else f"Reacted to your campaign ({e.text or 'like'})"
        by.setdefault(p.customer_id, []).append((_utc(e.created_at), text, e.provider,
                                                  f"@{p.username}" if p.username else p.name))
    return by


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
    social = _social_inbound(db, business_id)
    newest: dict[int, int] = {}
    for l in leads:
        newest[l.customer_id] = max(newest.get(l.customer_id, 0), l.id)
    out = []
    for l in leads:
        o = s.LeadOut.model_validate(l)
        o.appointment_id = booked.get(l.id)
        phone = normalize_phone(l.customer.phone) if l.customer.phone else None
        msgs = [(_utc(m.created_at), m.body or m.payload or "", "whatsapp", None) for m in inbound.get(phone or "-", [])]
        msgs += social.get(l.customer_id, [])
        if social.get(l.customer_id):
            o.social = next((h for *_, h in reversed(social[l.customer_id]) if h), None)
        src = (l.source or "").lower()
        ch = {m[2] for m in msgs}
        if "(whatsapp)" in (l.requirement or "").lower() or "whatsapp" in src:
            ch.add("whatsapp")
        ch |= {p for p in ("facebook", "instagram") if src.startswith(p)}
        o.channels = [c for c in ("whatsapp", "facebook", "instagram") if c in ch]
        if msgs and newest.get(l.customer_id) == l.id:
            msgs.sort(key=lambda m: m[0])
            last = msgs[-1]
            o.last_message, o.last_message_at, o.channel = last[1][:200], last[0], last[2]
            seen, made = _utc(l.chat_seen_at), _utc(l.created_at)
            o.unread = sum(1 for m in msgs if (seen is None and m[0] >= made - timedelta(minutes=1)) or (seen and m[0] > seen))
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
