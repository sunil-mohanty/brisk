"""WhatsApp messages sent by the system through Meta's WhatsApp Cloud API.

With WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID set, messages go out at once from the platform's WhatsApp
Business number. A message to someone who hasn't written to that number in the last 24 hours must be an
approved template (WHATSAPP_TEMPLATE for booking confirmations, WHATSAPP_QUOTE_TEMPLATE for quotes). Replies
inside a conversation the client started (the Accept button, picking a time) can be free text and lists.

Without them nothing is sent automatically: the message is saved with status "manual" and appears on the
owner's Today screen as a one-tap WhatsApp link, so nothing is ever lost.
"""

import logging

import httpx
from sqlalchemy.orm import Session

from .config import get_settings
from .models import OutboundMessage
from .utils import normalize_phone, whatsapp_link

log = logging.getLogger("salon.whatsapp")


def automatic() -> bool:
    s = get_settings()
    return bool(s.whatsapp_token and s.whatsapp_phone_number_id)


def quotes_automatic() -> bool:
    return automatic() and bool(get_settings().whatsapp_quote_template)


def _post(payload: dict) -> tuple[bool, str | None, str | None]:
    """Returns (ok, error, Meta message id)."""
    s = get_settings()
    try:
        r = httpx.post(
            f"{s.whatsapp_graph_url.rstrip('/')}/{s.whatsapp_phone_number_id}/messages",
            headers={"Authorization": f"Bearer {s.whatsapp_token}"},
            json=payload,
            timeout=10,
        )
        if r.status_code >= 300:
            log.error("WhatsApp send failed: %s %s", r.status_code, r.text[:300])
            return False, f"{r.status_code}: {r.text[:200]}", None
        try:
            wamid = (r.json().get("messages") or [{}])[0].get("id")
        except ValueError:
            wamid = None
        return True, None, wamid
    except httpx.HTTPError as e:
        log.error("Could not reach WhatsApp Cloud API: %s", e)
        return False, str(e)[:200], None


def _text_params(values: list[str]) -> list[dict]:
    # Template variables can't contain new lines, tabs or more than 4 spaces in a row.
    return [{"type": "text", "text": " ".join(str(v).split())[:200] or "-"} for v in values]


def _record(db: Session, payload: dict | None, **fields) -> OutboundMessage:
    msg = OutboundMessage(status="manual", **fields)
    if payload is not None:
        ok, err, wamid = _post(payload)
        msg.status = "sent" if ok else "failed"
        msg.error = err
        msg.wa_message_id = wamid
    db.add(msg)
    return msg


def send(
    db: Session,
    *,
    business_id: int,
    phone: str | None,
    name: str | None,
    kind: str,
    body: str,
    template_params: list[str] | None = None,
    appointment_id: int | None = None,
    quote_id: int | None = None,
) -> OutboundMessage:
    """Send now if WhatsApp is connected, otherwise leave it for the owner. The caller commits."""
    to = normalize_phone(phone)
    payload = None
    if to and automatic():
        s = get_settings()
        if s.whatsapp_template and template_params:
            payload = {
                "messaging_product": "whatsapp", "to": to, "type": "template",
                "template": {
                    "name": s.whatsapp_template,
                    "language": {"code": s.whatsapp_template_lang},
                    "components": [{"type": "body", "parameters": _text_params(template_params)}],
                },
            }
        else:
            payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": body}}
    return _record(db, payload, business_id=business_id, appointment_id=appointment_id, quote_id=quote_id,
                   to_phone=phone, to_name=name, kind=kind, body=body)


def send_quote(db: Session, *, business_id: int, quote_id: int, token: str, phone: str | None, name: str | None,
               body: str, params: list[str]) -> OutboundMessage:
    """The quote template: 5 body variables, Accept / Decline quick replies and a "View quote" link button.

    The quick replies carry accept:<token> / decline:<token>, which come back to the webhook when tapped.
    """
    s = get_settings()
    to = normalize_phone(phone)
    payload = None
    if to and quotes_automatic():
        payload = {
            "messaging_product": "whatsapp", "to": to, "type": "template",
            "template": {
                "name": s.whatsapp_quote_template,
                "language": {"code": s.whatsapp_template_lang},
                "components": [
                    {"type": "body", "parameters": _text_params(params)},
                    {"type": "button", "sub_type": "quick_reply", "index": "0", "parameters": [{"type": "payload", "payload": f"accept:{token}"}]},
                    {"type": "button", "sub_type": "quick_reply", "index": "1", "parameters": [{"type": "payload", "payload": f"decline:{token}"}]},
                    {"type": "button", "sub_type": "url", "index": "2", "parameters": [{"type": "text", "text": token}]},
                ],
            },
        }
    return _record(db, payload, business_id=business_id, quote_id=quote_id, to_phone=phone, to_name=name, kind="quote", body=body)


# ---------- replies inside a conversation the client started (no template needed) ----------
def reply_text(db: Session, *, business_id: int | None, to: str, body: str, quote_id: int | None = None) -> OutboundMessage | None:
    payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": body[:4096], "preview_url": True}}
    return _reply(db, payload, business_id, to, body, quote_id)


def reply_list(db: Session, *, business_id: int | None, to: str, body: str, button: str, rows: list[dict],
               header: str | None = None, quote_id: int | None = None) -> OutboundMessage | None:
    """rows: [{"id", "title" (≤24), "description" (≤72, optional)}], at most 10."""
    clean = []
    for r in rows[:10]:
        row = {"id": r["id"][:200], "title": r["title"][:24]}
        if r.get("description"):
            row["description"] = r["description"][:72]
        clean.append(row)
    interactive = {
        "type": "list",
        "body": {"text": body[:1024]},
        "action": {"button": button[:20], "sections": [{"title": "Choose one"[:24], "rows": clean}]},
    }
    if header:
        interactive["header"] = {"type": "text", "text": header[:60]}
    payload = {"messaging_product": "whatsapp", "to": to, "type": "interactive", "interactive": interactive}
    return _reply(db, payload, business_id, to, body, quote_id)


def reply_buttons(db: Session, *, business_id: int | None, to: str, body: str, buttons: list[tuple[str, str]],
                  quote_id: int | None = None) -> OutboundMessage | None:
    """Up to 3 reply buttons: [(id, title ≤20)]."""
    payload = {
        "messaging_product": "whatsapp", "to": to, "type": "interactive",
        "interactive": {
            "type": "button", "body": {"text": body[:1024]},
            "action": {"buttons": [{"type": "reply", "reply": {"id": i[:256], "title": t[:20]}} for i, t in buttons[:3]]},
        },
    }
    return _reply(db, payload, business_id, to, body, quote_id)


def _reply(db: Session, payload: dict, business_id: int | None, to: str, body: str, quote_id: int | None) -> OutboundMessage | None:
    if not automatic():
        return None
    if business_id is None:  # not tied to a salon (e.g. "I don't understand"): send, don't log
        _post(payload)
        return None
    return _record(db, payload, business_id=business_id, quote_id=quote_id, to_phone="+" + to, to_name=None, kind="bot", body=body)


def accept_link(text: str) -> str | None:
    """wa.me link to the business number with a pre-filled message (for "Accept on WhatsApp")."""
    n = get_settings().whatsapp_business_number
    return whatsapp_link("+" + n.lstrip("+"), text) if n and automatic() else None
