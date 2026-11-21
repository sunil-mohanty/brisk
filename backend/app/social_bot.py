"""Facebook and Instagram webhooks: comments, reactions and direct messages become leads.

- A comment on a campaign post: the person becomes a client (Meta never shares a phone) and a lead, and, when the
  salon has automatic replies on, gets a private message with the offer link. When they accept on the offer page
  with their mobile, the lead and the client join up with that number.
- A Facebook reaction (like, love...) on a campaign post: counted on the campaign and kept as a lead.
  Facebook doesn't allow messaging people who only reacted.
- A direct message (Messenger or Instagram): in the lead's chat, where the owner can reply for 24 hours.

Instagram sends no webhook for likes, so they can't be followed.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import (Business, Campaign, CampaignPost, Customer, Lead, LeadStatus, Quote, SocialAccount, SocialEvent,
                     SocialPerson, utcnow)
from .utils import new_token, quote_totals

log = logging.getLogger("salon.social")

LABEL = {"facebook": "Facebook", "instagram": "Instagram"}
PRIVATE_REPLY = ("Hi {first}! Thanks for your comment on our offer \"{title}\" ({price}).\n\n"
                 "Here it is: {url}\nTap the link to accept and choose your time.\n\n"
                 "Any questions? Just reply to this message and we'll answer you here.\n\n{salon}")
REPLY_DAYS = 7  # Meta allows one private reply to a comment, within 7 days
DM_HOURS = 24  # and free messages within 24 hours of the person's last message


class SendError(Exception):
    pass


# ---------- Meta calls ----------
def _graph() -> str:
    return get_settings().meta_graph_url.rstrip("/")


def _token(a: SocialAccount) -> str | None:
    from .social import unseal
    return unseal(a.token_enc)


def _send(a: SocialAccount, recipient: dict, text: str, tag_response: bool = False) -> dict:
    """POST a message through the Page (Messenger or Instagram). recipient: {"comment_id"} or {"id"}."""
    from .social import client
    data = {"recipient": recipient, "message": {"text": text[:1000]}}
    if tag_response:
        data["messaging_type"] = "RESPONSE"
    try:
        r = client().post(f"{_graph()}/me/messages", params={"access_token": _token(a)}, json=data)
    except Exception as e:  # network
        raise SendError(f"Couldn't reach Meta: {e}"[:300]) from e
    try:
        out = r.json()
    except ValueError:
        out = {}
    if r.status_code >= 400:
        err = out.get("error") if isinstance(out, dict) else None
        msg = (err.get("error_user_msg") or err.get("message")) if isinstance(err, dict) else r.text[:200]
        code = err.get("code") if isinstance(err, dict) else None
        if code in (200, 230) or "permission" in str(msg).lower():
            msg = (f"{msg} (In Settings → Social media press Reconnect and allow messaging; the Meta app needs "
                   "pages_messaging and instagram_manage_messages.)")
        raise SendError(str(msg)[:300])
    return out


def _profile(a: SocialAccount, uid: str) -> dict:
    """Name (Messenger) or name and username (Instagram) of someone who wrote to the Page. Best effort."""
    from .social import _json, client
    fields = "name,username" if a.provider == "instagram" else "first_name,last_name,name"
    try:
        return _json(client().get(f"{_graph()}/{uid}", params={"fields": fields, "access_token": _token(a)}))
    except Exception:
        return {}


# ---------- people, leads ----------
def _person(db: Session, b: Business, provider: str, person_id: str, name: str | None, username: str | None) -> SocialPerson:
    p = db.scalar(select(SocialPerson).where(SocialPerson.business_id == b.id, SocialPerson.provider == provider,
                                             SocialPerson.person_id == person_id))
    if not p:
        tok = new_token(12)
        while db.scalar(select(SocialPerson.id).where(SocialPerson.token == tok)):
            tok = new_token(12)
        p = SocialPerson(business_id=b.id, provider=provider, person_id=person_id, token=tok)
        db.add(p)
    if name:
        p.name = name[:200]
    if username:
        p.username = username[:120]
    if not p.customer_id:
        cu = Customer(business_id=b.id, name=display_name(p), notes=f"From {LABEL[provider]}"
                      + (f" (@{p.username})" if p.username else ""))
        db.add(cu)
        db.flush()
        p.customer_id = cu.id
    elif name and p.customer and p.customer.name.startswith(("@", "Facebook ", "Instagram ")) and not p.customer.phone:
        p.customer.name = name[:160]
    db.flush()
    return p


def display_name(p: SocialPerson) -> str:
    return (p.name or (f"@{p.username}" if p.username else f"{LABEL[p.provider]} visitor"))[:160]


def _lead(db: Session, b: Business, p: SocialPerson, source: str, note: str, c: Campaign | None) -> Lead:
    """The person's open lead from the last 30 days, or a new one."""
    since = utcnow() - timedelta(days=30)
    lead = db.scalar(select(Lead).where(Lead.business_id == b.id, Lead.customer_id == p.customer_id, Lead.created_at >= since)
                     .order_by(Lead.id.desc()))
    if lead:
        lead.requirement = ((lead.requirement or "") + "\n" + note).strip()[-2000:]
        lead.updated_at = utcnow()
        if lead.status in (LeadStatus.lost,):
            lead.status = LeadStatus.new
        return lead
    lead = Lead(business_id=b.id, customer_id=p.customer_id, source=source[:80], requirement=note[:2000], status=LeadStatus.new,
                service_interest=(" + ".join(i.description for i in c.items)[:300] or c.title[:300]) if c else None)
    db.add(lead)
    db.flush()
    return lead


def _campaign_for(db: Session, b: Business, provider: str, post_id: str | None) -> Campaign | None:
    if not post_id:
        return None
    post = db.scalar(select(CampaignPost).where(CampaignPost.business_id == b.id, CampaignPost.provider == provider,
                                                CampaignPost.remote_id == post_id))
    return db.get(Campaign, post.campaign_id) if post else None


def offer_link(c: Campaign, p: SocialPerson) -> str:
    return f"{get_settings().app_url.rstrip('/')}/c/{c.token}?via={p.provider}&p={p.token}"


def _seen(db: Session, remote_id: str | None) -> bool:
    return bool(remote_id) and bool(db.scalar(select(SocialEvent.id).where(SocialEvent.remote_id == remote_id)))


# ---------- events ----------
def on_comment(db: Session, a: SocialAccount, *, comment_id: str, post_id: str | None, from_id: str, name: str | None,
               username: str | None, text: str) -> SocialEvent | None:
    if _seen(db, comment_id):
        return None  # Meta retried
    b = db.get(Business, a.business_id)
    c = _campaign_for(db, b, a.provider, post_id)
    p = _person(db, b, a.provider, from_id, name, username)
    where = f"your campaign \"{c.title}\"" if c else "a post"
    _lead(db, b, p, f"{LABEL[a.provider]} comment" + (f": {c.title}" if c else ""),
          f"Commented on {where} on {LABEL[a.provider]}.", c)
    ev = SocialEvent(business_id=b.id, person_id=p.id, campaign_id=c.id if c else None, provider=a.provider, kind="comment",
                     text=text[:4000], remote_id=comment_id, post_id=post_id)
    db.add(ev)
    db.flush()
    if c and b.social_auto_reply and c.active:
        t = quote_totals(c.items, c.discount, c.vat_rate)
        body = PRIVATE_REPLY.format(first=p.name.split()[0] if p.name else f"@{p.username}" if p.username else "there", title=c.title,
                                    price=f"{b.currency} {t.total:,.0f}", url=offer_link(c, p), salon=b.name)
        private_reply(db, a, p, ev, body)
    return ev


def on_reaction(db: Session, a: SocialAccount, *, post_id: str | None, from_id: str, name: str | None, reaction: str) -> None:
    b = db.get(Business, a.business_id)
    c = _campaign_for(db, b, a.provider, post_id)
    if not c:
        return  # only reactions on campaigns are followed
    key = f"r:{post_id}:{from_id}"
    if _seen(db, key):
        return  # changed their reaction
    p = _person(db, b, a.provider, from_id, name, None)
    _lead(db, b, p, f"{LABEL[a.provider]} like: {c.title}",
          f"Liked your campaign \"{c.title}\" on {LABEL[a.provider]}.", c)
    db.add(SocialEvent(business_id=b.id, person_id=p.id, campaign_id=c.id, provider=a.provider, kind="reaction",
                       text=reaction.lower() or "like", remote_id=key, post_id=post_id))


def on_message(db: Session, a: SocialAccount, *, sender: str, mid: str | None, text: str) -> None:
    if _seen(db, mid):
        return
    b = db.get(Business, a.business_id)
    p = db.scalar(select(SocialPerson).where(SocialPerson.business_id == b.id, SocialPerson.provider == a.provider,
                                             SocialPerson.msg_id == sender))
    if not p:
        prof = _profile(a, sender)
        p = _person(db, b, a.provider, sender, prof.get("name") or " ".join(filter(None, [prof.get("first_name"), prof.get("last_name")])) or None,
                    prof.get("username"))
        p.msg_id = sender
    last_in = db.scalar(select(SocialEvent.created_at).where(SocialEvent.person_id == p.id, SocialEvent.kind == "message_in")
                        .order_by(SocialEvent.id.desc()))
    _lead(db, b, p, f"{LABEL[a.provider]} message", f"Messaged on {LABEL[a.provider]}.", None)
    db.add(SocialEvent(business_id=b.id, person_id=p.id, provider=a.provider, kind="message_in", text=text[:4000], remote_id=mid))
    db.flush()
    # The automatic "thanks, we'll reach out", once a day at most
    from .wa_bot import AUTO_REPLY
    # not when the salon already wrote to them today (the offer message, or the owner)
    recent_auto = db.scalar(select(SocialEvent.id).where(SocialEvent.person_id == p.id,
                                                         SocialEvent.kind.in_(("message_out", "private_reply")),
                                                         SocialEvent.created_at >= utcnow() - timedelta(hours=24)))
    if b.social_auto_reply and not recent_auto and not (last_in and _aware(last_in) > utcnow() - timedelta(hours=24)):
        body = ((b.wa_auto_reply or "").strip() or AUTO_REPLY.format(salon=b.name)).replace("{salon}", b.name)
        ev = SocialEvent(business_id=b.id, person_id=p.id, provider=a.provider, kind="message_out", text=body, status="auto")
        db.add(ev)
        try:
            r = _send(a, {"id": sender}, body, tag_response=True)
            ev.remote_id = r.get("message_id")
        except SendError as e:
            ev.status, ev.error = "failed", str(e)[:300]
            log.warning("%s automatic reply failed: %s", LABEL[a.provider], e)


def _aware(dt):
    from datetime import timezone
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def private_reply(db: Session, a: SocialAccount, p: SocialPerson, comment: SocialEvent, body: str) -> SocialEvent:
    ev = SocialEvent(business_id=p.business_id, person_id=p.id, campaign_id=comment.campaign_id, provider=a.provider,
                     kind="private_reply", text=body, post_id=comment.remote_id, status="sent")
    db.add(ev)
    try:
        r = _send(a, {"comment_id": comment.remote_id}, body)
        if r.get("recipient_id"):
            p.msg_id = str(r["recipient_id"])  # now they can be messaged (once they write back, for 24 hours)
        ev.remote_id = r.get("message_id")
    except SendError as e:
        ev.status, ev.error = "failed", str(e)[:300]
        log.warning("%s private reply to comment %s failed: %s", LABEL[a.provider], comment.remote_id, e)
    db.flush()
    return ev


# ---------- replying from the Leads chat ----------
def account_for(db: Session, p: SocialPerson) -> SocialAccount | None:
    return db.scalar(select(SocialAccount).where(SocialAccount.business_id == p.business_id, SocialAccount.provider == p.provider)
                     .order_by(SocialAccount.selected.desc(), SocialAccount.id))


def reply_state(db: Session, p: SocialPerson) -> tuple[str | None, object | None]:
    """How the salon can write to this person now: ("dm", until) within 24h of their last message,
    ("comment", until) when a comment of theirs is less than 7 days old and hasn't had its private reply, else (None, None)."""
    last_in = db.scalar(select(SocialEvent.created_at).where(SocialEvent.person_id == p.id, SocialEvent.kind == "message_in")
                        .order_by(SocialEvent.id.desc()))
    if last_in and p.msg_id and _aware(last_in) + timedelta(hours=DM_HOURS) > utcnow():
        return "dm", _aware(last_in) + timedelta(hours=DM_HOURS)
    c = _open_comment(db, p)
    if c:
        return "comment", _aware(c.created_at) + timedelta(days=REPLY_DAYS)
    return None, None


def _open_comment(db: Session, p: SocialPerson) -> SocialEvent | None:
    replied = {r for r in db.scalars(select(SocialEvent.post_id).where(SocialEvent.person_id == p.id,
                                                                        SocialEvent.kind == "private_reply",
                                                                        SocialEvent.status == "sent"))}
    since = utcnow() - timedelta(days=REPLY_DAYS)
    for c in db.scalars(select(SocialEvent).where(SocialEvent.person_id == p.id, SocialEvent.kind == "comment",
                                                  SocialEvent.created_at >= since).order_by(SocialEvent.id.desc())):
        if c.remote_id not in replied:
            return c
    return None


def last_comment(db: Session, p: SocialPerson) -> SocialEvent | None:
    """Their newest comment: the salon can always answer it publicly, underneath."""
    return db.scalar(select(SocialEvent).where(SocialEvent.person_id == p.id, SocialEvent.kind == "comment",
                                               SocialEvent.remote_id.is_not(None)).order_by(SocialEvent.id.desc()))


def public_reply(db: Session, a: SocialAccount, p: SocialPerson, comment: SocialEvent, text: str) -> SocialEvent:
    """Answer under their comment on the post, as the Page / Instagram account (everyone can see it)."""
    from .social import client
    ev = SocialEvent(business_id=p.business_id, person_id=p.id, campaign_id=comment.campaign_id, provider=a.provider,
                     kind="comment_reply", text=text, post_id=comment.remote_id, status="sent")
    db.add(ev)
    edge = "replies" if a.provider == "instagram" else "comments"
    try:
        r = client().post(f"{_graph()}/{comment.remote_id}/{edge}", data={"message": text[:2000], "access_token": _token(a)})
        out = r.json() if r.content else {}
        if r.status_code >= 400:
            err = out.get("error") if isinstance(out, dict) else None
            msg = (err.get("error_user_msg") or err.get("message")) if isinstance(err, dict) else r.text[:200]
            if "permission" in str(msg).lower() or (isinstance(err, dict) and err.get("code") in (10, 200)):
                msg = f"{msg} (Press Reconnect in Settings → Social media and allow everything; the Meta app needs " \
                      f"{'instagram_manage_comments' if a.provider == 'instagram' else 'pages_manage_engagement'}.)"
            raise SendError(str(msg)[:300])
        ev.remote_id = out.get("id")
    except SendError as e:
        ev.status, ev.error = "failed", str(e)[:300]
    except Exception as e:  # network
        ev.status, ev.error = "failed", f"Couldn't reach Meta: {e}"[:300]
    db.flush()
    return ev


def send_from_chat(db: Session, p: SocialPerson, text: str, public: bool = False) -> SocialEvent:
    a = account_for(db, p)
    if not a:
        raise SendError(f"{LABEL[p.provider]} isn't connected any more. Connect it again in Settings → Social media.")
    if public:
        c = last_comment(db, p)
        if not c:
            raise SendError(f"They haven't commented on {LABEL[p.provider]}, so there's nothing to reply under.")
        return public_reply(db, a, p, c, text)
    how, _ = reply_state(db, p)
    if how == "dm":
        ev = SocialEvent(business_id=p.business_id, person_id=p.id, provider=p.provider, kind="message_out", text=text, status="sent")
        db.add(ev)
        try:
            ev.remote_id = _send(a, {"id": p.msg_id}, text, tag_response=True).get("message_id")
        except SendError as e:
            ev.status, ev.error = "failed", str(e)[:300]
        db.flush()
        return ev
    if how == "comment":
        return private_reply(db, a, p, _open_comment(db, p), text)
    raise SendError("closed")


# ---------- the webhook ----------
def handle_webhook(db: Session, body: dict) -> int:
    """Returns how many events it handled. Unknown Pages and accounts are ignored."""
    obj = body.get("object")
    provider = {"page": "facebook", "instagram": "instagram"}.get(obj)
    if not provider:
        return 0
    n = 0
    for entry in body.get("entry") or []:
        own = str(entry.get("id") or "")
        accounts = db.scalars(select(SocialAccount).where(SocialAccount.provider == provider, SocialAccount.account_id == own)).all()
        if not accounts:
            log.info("%s webhook for an account no salon has connected (%s)", LABEL[provider], own)
            continue
        for a in accounts:  # normally one salon per Page
            try:
                n += _entry(db, a, provider, own, entry)
                db.commit()
            except Exception:
                db.rollback()
                log.exception("%s webhook: couldn't handle an event", LABEL[provider])
    return n


def _entry(db: Session, a: SocialAccount, provider: str, own: str, entry: dict) -> int:
    n = 0
    for ch in entry.get("changes") or []:
        field, v = ch.get("field"), ch.get("value") or {}
        frm = v.get("from") or {}
        fid = str(frm.get("id") or "")
        if not fid or fid == own:
            continue  # the salon's own comments and replies
        if provider == "facebook" and field == "feed" and v.get("verb") == "add":
            if v.get("item") == "comment" and v.get("comment_id"):
                n += bool(on_comment(db, a, comment_id=str(v["comment_id"]), post_id=v.get("post_id"), from_id=fid,
                                     name=frm.get("name"), username=None, text=v.get("message") or ""))
            elif v.get("item") in ("reaction", "like"):
                on_reaction(db, a, post_id=v.get("post_id"), from_id=fid, name=frm.get("name"),
                            reaction=v.get("reaction_type") or "like")
                n += 1
        elif provider == "instagram" and field in ("comments", "live_comments") and v.get("id"):
            n += bool(on_comment(db, a, comment_id=str(v["id"]), post_id=str((v.get("media") or {}).get("id") or ""),
                                 from_id=fid, name=None, username=frm.get("username"), text=v.get("text") or ""))
    for m in entry.get("messaging") or []:
        msg = m.get("message") or {}
        sender = str((m.get("sender") or {}).get("id") or "")
        if not msg or msg.get("is_echo") or not sender or sender == own:
            continue
        text = msg.get("text") or ("[photo or attachment]" if msg.get("attachments") else "")
        if text:
            on_message(db, a, sender=sender, mid=msg.get("mid"), text=text)
            n += 1
    return n


def join_offer(db: Session, business_id: int, token: str | None, phone: str, name: str) -> tuple[Customer | None, Lead | None]:
    """The person from a comment accepted the offer link with their mobile: their client gets the number
    (or moves onto the client who already has it) and their lead is used for the acceptance."""
    from .logic import find_customer_by_phone
    if not token:
        return None, None
    p = db.scalar(select(SocialPerson).where(SocialPerson.business_id == business_id, SocialPerson.token == token))
    if not p or not p.customer_id:
        return None, None
    mine = db.get(Customer, p.customer_id)
    other = find_customer_by_phone(db, business_id, phone)
    since = utcnow() - timedelta(days=30)
    lead = db.scalar(select(Lead).where(Lead.business_id == business_id, Lead.customer_id == mine.id, Lead.created_at >= since)
                     .order_by(Lead.id.desc()))
    if other and other.id != mine.id:
        for l in db.scalars(select(Lead).where(Lead.customer_id == mine.id)):
            l.customer_id = other.id
        for q in db.scalars(select(Quote).where(Quote.customer_id == mine.id)):
            q.customer_id = other.id
        for sp in db.scalars(select(SocialPerson).where(SocialPerson.customer_id == mine.id)):
            sp.customer_id = other.id
        db.flush()
        db.expire(mine)
        db.delete(mine)
        db.flush()
        return other, lead
    if not mine.phone:
        mine.phone = phone
        if mine.name.startswith(("@", "Facebook ", "Instagram ")) or not p.name:
            mine.name = name[:160]
    return mine, lead
