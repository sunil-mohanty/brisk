"""WhatsApp messages sent by the system (not by the owner's phone).

With WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID set, messages go out at once through Meta's
WhatsApp Cloud API from the platform's business number. Messages to people who haven't written to
that number in the last 24 hours must use an approved template (WHATSAPP_TEMPLATE).

Without them, nothing is sent automatically: the message is saved with status "manual" and appears on
the owner's Today screen as a one-tap WhatsApp link, so no confirmation is ever lost.
"""

import logging

import httpx
from sqlalchemy.orm import Session

from .config import get_settings
from .models import OutboundMessage
from .utils import normalize_phone

log = logging.getLogger("salon.whatsapp")
GRAPH = "https://graph.facebook.com/v21.0"


def automatic() -> bool:
    s = get_settings()
    return bool(s.whatsapp_token and s.whatsapp_phone_number_id)


def _post(payload: dict) -> tuple[bool, str | None]:
    s = get_settings()
    try:
        r = httpx.post(
            f"{GRAPH}/{s.whatsapp_phone_number_id}/messages",
            headers={"Authorization": f"Bearer {s.whatsapp_token}"},
            json=payload,
            timeout=10,
        )
        if r.status_code >= 300:
            log.error("WhatsApp send failed: %s %s", r.status_code, r.text[:300])
            return False, f"{r.status_code}: {r.text[:200]}"
        return True, None
    except httpx.HTTPError as e:
        log.error("Could not reach WhatsApp Cloud API: %s", e)
        return False, str(e)[:200]


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
) -> OutboundMessage:
    """Send now if WhatsApp is connected, otherwise leave it for the owner. The caller commits."""
    to = normalize_phone(phone)
    msg = OutboundMessage(
        business_id=business_id, appointment_id=appointment_id, to_phone=phone, to_name=name,
        kind=kind, body=body, status="manual",
    )
    if to and automatic():
        s = get_settings()
        if s.whatsapp_template and template_params:
            payload = {
                "messaging_product": "whatsapp", "to": to, "type": "template",
                "template": {
                    "name": s.whatsapp_template,
                    "language": {"code": s.whatsapp_template_lang},
                    "components": [{"type": "body", "parameters": [{"type": "text", "text": p[:200]} for p in template_params]}],
                },
            }
        else:
            payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": body}}
        ok, err = _post(payload)
        msg.status = "sent" if ok else "failed"
        msg.error = err
    db.add(msg)
    return msg
