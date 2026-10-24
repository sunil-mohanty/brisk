"""The WhatsApp conversation: quotes accepted, declined and booked inside WhatsApp.

Flow (all ids travel inside button / list-row ids, so no conversation state is stored):

  quote template ──[Accept]──► accept:<token>  → quote accepted, list of free days + "Book later"
                 ──[Decline]─► decline:<token> → quote declined
  day row        day:<token>:<YYYY-MM-DD>       → list of free times that day (+ other day, book later)
  time row       slot:<token>:<YYYY-MM-DD>:<HHMM> → booked if still free → "Accepted · Booking confirmed"
                                                   taken → new list of times for that day
  later row      later:<token>                  → "Accepted · Awaiting booking" (salon confirms the time)
  "Accept on WhatsApp" from a campaign: the client sends "... (code ABCD123456)" → own quote, accepted → days list
  "accept" / "yes" / "book" typed by hand       → the latest quote we sent to that number
"""

import logging
import re
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import booking, whatsapp
from .activity import UAE
from .logic import quote_url
from .models import Campaign, OutboundMessage, Quote, QuoteStatus, WhatsAppInbound
from .utils import is_expired, normalize_phone, quote_label, quote_totals, valid_until

log = logging.getLogger("salon.wa_bot")

CAMPAIGN_CODE = re.compile(r"\bcode[:\s#]*([A-Za-z0-9]{6,20})\b", re.I)
YES = {"accept", "accepted", "yes", "ok", "okay", "confirm", "agree", "نعم", "موافق"}
NO = {"decline", "no", "reject", "لا"}
BOOK = {"book", "booking", "time", "slot", "appointment"}


# ---------- what goes out ----------
def quote_params(q: Quote) -> list[str]:
    first = (q.customer.name.split()[0] if q.customer and q.customer.name else "") or "there"
    what = ", ".join(i.description for i in q.items) or "your treatment"
    t = quote_totals(q.items, q.discount, q.vat_rate)
    until = valid_until(q.created_at, q.valid_days).strftime("%d %b %Y").lstrip("0")
    return [first, q.business.name, what[:150], f"{q.business.currency} {t.total:,.2f}", until]


def send_quote(db: Session, q: Quote) -> OutboundMessage:
    """Sends the quote with Accept / Decline buttons. The caller commits."""
    first, salon, what, total, until = quote_params(q)
    body = (f"Hi {first}, {salon} has sent you a quote: {what} for {total}. Valid until {until}. "
            f"Tap Accept to accept and book a time, or view it here: {quote_url(q)}")
    return whatsapp.send_quote(db, business_id=q.business_id, quote_id=q.id, token=q.token,
                               phone=q.customer.phone if q.customer else None, name=q.customer.name if q.customer else None,
                               body=body, params=[first, salon, what, total, until])


def _hm12(hhmm: str) -> str:
    h, m = int(hhmm[:2]), hhmm[3:5]
    return f"{(h % 12) or 12}:{m} {'AM' if h < 12 else 'PM'}"


def _day_title(d: date) -> str:
    today = datetime.now(UAE).date()
    if d == today:
        return "Today"
    if d == today + timedelta(days=1):
        return "Tomorrow"
    return d.strftime("%a %d %b").replace(" 0", " ")


def _free_days(db: Session, q: Quote, limit: int = 9) -> list[tuple[date, int]]:
    minutes = booking.quote_duration(db, q)
    today = datetime.now(UAE).date()
    out = []
    for i in range(booking.BOOK_AHEAD_DAYS + 1):
        d = today + timedelta(days=i)
        n = len(booking.free_slots(db, q.business, d, minutes))
        if n:
            out.append((d, n))
        if len(out) >= limit:
            break
    return out


def _sample(slots: list[str], n: int) -> list[str]:
    if len(slots) <= n:
        return slots
    step = (len(slots) - 1) / (n - 1)
    return list(dict.fromkeys(slots[round(i * step)] for i in range(n)))


def offer_days(db: Session, q: Quote, to: str, intro: str) -> None:
    days = _free_days(db, q)
    if not days:
        whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id, body=(
            f"{intro}\n\nThere are no free times online right now, so {q.business.name} will message you to arrange one."))
        return
    rows = [{"id": f"day:{q.token}:{d.isoformat()}", "title": _day_title(d), "description": f"{n} free time{'s' if n != 1 else ''}"}
            for d, n in days]
    rows.append({"id": f"later:{q.token}", "title": "Book later", "description": f"{q.business.name} will arrange a time with you"})
    whatsapp.reply_list(db, business_id=q.business_id, to=to, quote_id=q.id, header="Book your appointment", button="Choose a day",
                        body=f"{intro}\n\nWould you like to book a time now? Choose a day.", rows=rows)


def offer_times(db: Session, q: Quote, to: str, d: date, intro: str = "") -> None:
    minutes = booking.quote_duration(db, q)
    slots = booking.free_slots(db, q.business, d, minutes)
    if not slots:
        offer_days(db, q, to, (intro + " " if intro else "") + f"{_day_title(d)} is now fully booked.")
        return
    rows = [{"id": f"slot:{q.token}:{d.isoformat()}:{t.replace(':', '')}", "title": _hm12(t), "description": f"{_day_title(d)} · {minutes} min"}
            for t in _sample(slots, 8)]
    rows.append({"id": f"days:{q.token}", "title": "Another day"})
    rows.append({"id": f"later:{q.token}", "title": "Book later"})
    whatsapp.reply_list(db, business_id=q.business_id, to=to, quote_id=q.id, button="Choose a time",
                        body=((intro + "\n\n") if intro else "") + f"Free times on {_day_title(d)}:", rows=rows)


# ---------- what comes in ----------
def _quote(db: Session, token: str) -> Quote | None:
    return db.scalar(select(Quote).where(Quote.token == token)) if token else None


def _latest_quote(db: Session, wa_id: str, statuses: tuple) -> Quote | None:
    """The newest quote we sent to this WhatsApp number that is in one of these states."""
    rows = db.scalars(
        select(OutboundMessage).where(OutboundMessage.kind == "quote", OutboundMessage.quote_id.is_not(None))
        .order_by(OutboundMessage.id.desc()).limit(300)
    ).all()
    for m in rows:
        if normalize_phone(m.to_phone) == wa_id:
            q = db.get(Quote, m.quote_id)
            if q and q.status in statuses:
                return q
    return None


def _accept(db: Session, q: Quote, to: str) -> None:
    from .routers.quotes import apply_decision

    if q.status == QuoteStatus.rejected:
        whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id,
                            body=f"This quote was declined earlier. Message {q.business.name} if you'd like a new one.")
        return
    if q.status != QuoteStatus.accepted:
        if is_expired(q.created_at, q.valid_days):
            whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id,
                                body=f"Sorry, quote {quote_label(q.number)} has expired. Ask {q.business.name} for an updated one.")
            return
        apply_decision(db, q, True)
        db.flush()
        intro = f"Thank you! Quote {quote_label(q.number)} from {q.business.name} is accepted ✅"
    elif q.booking_status == "confirmed":
        whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id,
                            body=f"You're all set: quote {quote_label(q.number)} is accepted and booked. Details: {quote_url(q)}")
        return
    else:
        intro = f"Quote {quote_label(q.number)} is accepted."
    offer_days(db, q, to, intro)


def _decline(db: Session, q: Quote, to: str) -> None:
    from .routers.quotes import apply_decision

    if q.status in (QuoteStatus.accepted, QuoteStatus.rejected):
        whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id,
                            body=f"Quote {quote_label(q.number)} was already {q.status.value}. Message {q.business.name} to change it.")
        return
    apply_decision(db, q, False)
    whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id,
                        body=f"No problem, we've let {q.business.name} know. Thank you for your reply.")


def _slot(db: Session, q: Quote, to: str, day_s: str, hhmm: str) -> None:
    if q.status != QuoteStatus.accepted:
        _accept(db, q, to)
        return
    if q.booking_status == "confirmed":
        whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id,
                            body=f"This quote is already booked. Details: {quote_url(q)}")
        return
    d = date.fromisoformat(day_s)
    t = f"{hhmm[:2]}:{hhmm[2:4]}"
    appt = booking.try_book(db, q, d, t)  # sends the booking confirmation itself
    if appt is None:
        offer_times(db, q, to, d, intro=f"Sorry, {_hm12(t)} on {_day_title(d)} was just taken.")


def _later(db: Session, q: Quote, to: str) -> None:
    if q.status != QuoteStatus.accepted:
        _accept(db, q, to)
        return
    if q.booking_status != "confirmed":
        q.booking_status = "awaiting"
    whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id, body=(
        f"Great, your quote is accepted. {q.business.name} will message you to confirm a time. "
        f"You can also book online any time: {quote_url(q)}"))


def _campaign(db: Session, code: str, to: str, name: str | None) -> bool:
    from .routers.campaigns import campaign_expired
    from .routers.public import create_campaign_quote

    c = db.scalar(select(Campaign).where(Campaign.token == code))
    if not c:
        return False
    if not c.active or campaign_expired(c):
        whatsapp.reply_text(db, business_id=c.business_id, to=to,
                            body=f"Sorry, the offer \"{c.title}\" has ended. Message {c.business.name} for current prices.")
        return True
    q = create_campaign_quote(db, c, name or "WhatsApp client", "+" + to)
    db.flush()
    db.refresh(q)
    offer_days(db, q, to, f"Thank you! Your offer \"{c.title}\" at {c.business.name} is accepted ✅ (quote {quote_label(q.number)})")
    return True


def _route(db: Session, action: str, to: str, name: str | None) -> bool:
    parts = action.split(":")
    kind, token = parts[0], parts[1] if len(parts) > 1 else ""
    q = _quote(db, token)
    if kind not in ("accept", "decline", "day", "days", "slot", "later") or not q:
        return False
    if kind == "accept":
        _accept(db, q, to)
    elif kind == "decline":
        _decline(db, q, to)
    elif kind == "days":
        offer_days(db, q, to, "Sure.")
    elif kind == "day" and len(parts) == 3:
        offer_times(db, q, to, date.fromisoformat(parts[2]))
    elif kind == "slot" and len(parts) == 4:
        _slot(db, q, to, parts[2], parts[3])
    elif kind == "later":
        _later(db, q, to)
    return True


def _text(db: Session, text: str, to: str, name: str | None) -> None:
    m = CAMPAIGN_CODE.search(text)
    if m and _campaign(db, m.group(1), to, name):
        return
    words = set(re.findall(r"[\w']+", text.lower()))
    if words & YES:
        q = _latest_quote(db, to, (QuoteStatus.sent, QuoteStatus.viewed, QuoteStatus.accepted))
        if q:
            _accept(db, q, to)
            return
    if words & BOOK:
        q = _latest_quote(db, to, (QuoteStatus.accepted,))
        if q and q.booking_status != "confirmed":
            offer_days(db, q, to, "Sure.")
            return
    if words & NO:
        q = _latest_quote(db, to, (QuoteStatus.sent, QuoteStatus.viewed))
        if q:
            _decline(db, q, to)
            return
    q = _latest_quote(db, to, tuple(QuoteStatus))
    if q:
        wa = q.business.whatsapp or q.business.phone
        contact = f" or message the salon directly on {wa}" if wa else ""
        whatsapp.reply_text(db, business_id=q.business_id, to=to, quote_id=q.id, body=(
            f"Thanks for your message. This number handles quotes and bookings for {q.business.name}. "
            f"Reply ACCEPT to accept your latest quote, BOOK to choose a time{contact}."))
    else:
        whatsapp.reply_text(db, business_id=None, to=to, body=(
            "Thanks for your message. This number sends quotes and booking confirmations for salons. "
            "Please message your salon directly."))


def handle_message(db: Session, msg: dict, contacts: list[dict]) -> None:
    wamid = msg.get("id")
    to = normalize_phone("+" + str(msg.get("from") or "")) or ""
    if not wamid or not to:
        return
    if db.scalar(select(WhatsAppInbound.id).where(WhatsAppInbound.wa_message_id == wamid)):
        return  # Meta retried a message we already handled
    name = next((c.get("profile", {}).get("name") for c in contacts if c.get("wa_id") == msg.get("from")), None)
    mtype = msg.get("type")
    action, text, kind = None, None, "other"
    if mtype == "button":  # quick reply on a template
        kind, action, text = "button", (msg.get("button") or {}).get("payload"), (msg.get("button") or {}).get("text")
    elif mtype == "interactive":
        it = msg.get("interactive") or {}
        reply = it.get("button_reply") or it.get("list_reply") or {}
        kind, action, text = ("list" if it.get("list_reply") else "button"), reply.get("id"), reply.get("title")
    elif mtype == "text":
        kind, text = "text", (msg.get("text") or {}).get("body")
    db.add(WhatsAppInbound(wa_message_id=wamid, from_phone=to, kind=kind, payload=(action or text or "")[:500]))
    db.flush()
    try:
        handled = bool(action) and _route(db, action, to, name)
        if not handled and (text or action):
            if action and not text:
                text = action
            _text(db, text or "", to, name)
    except (ValueError, IndexError) as e:  # a tampered or stale id
        log.warning("WhatsApp message %s not understood: %s", wamid, e)


def handle_status(db: Session, st: dict) -> None:
    """sent / delivered / read / failed updates for messages we sent."""
    wamid, status = st.get("id"), st.get("status")
    if not wamid or status not in ("sent", "delivered", "read", "failed"):
        return
    m = db.scalar(select(OutboundMessage).where(OutboundMessage.wa_message_id == wamid))
    if not m or m.status == "done":
        return
    order = {"sent": 1, "delivered": 2, "read": 3}
    if status == "failed":
        err = (st.get("errors") or [{}])[0]
        m.status = "failed"
        m.error = f"{err.get('code', '')}: {err.get('title') or err.get('message') or 'not delivered'}"[:300]
    elif order.get(status, 0) > order.get(m.status, 0):
        m.status = status


def handle_webhook(db: Session, body: dict) -> None:
    for entry in body.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            contacts = value.get("contacts") or []
            for st in value.get("statuses") or []:
                handle_status(db, st)
                db.commit()
            for msg in value.get("messages") or []:
                try:
                    handle_message(db, msg, contacts)
                    db.commit()
                except Exception:  # one bad message mustn't block the rest; Meta would retry forever
                    db.rollback()
                    log.exception("WhatsApp message failed")
