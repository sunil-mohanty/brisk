"""Meta's webhook for the WhatsApp Business number: client replies, button taps and delivery updates.

Set the callback URL in Meta to https://<your web domain>/api/whatsapp/webhook (the web app forwards /api/* here).
"""

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from .. import schemas as s
from .. import wa_bot, whatsapp
from ..config import get_settings
from ..db import get_db
from ..models import User
from ..security import current_user

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
log = logging.getLogger("salon.whatsapp")


@router.get("/webhook")
def verify(mode: str = Query(alias="hub.mode", default=""), token: str = Query(alias="hub.verify_token", default=""),
           challenge: str = Query(alias="hub.challenge", default="")):
    """Meta calls this once when you press "Verify and save"."""
    expected = get_settings().whatsapp_verify_token
    if mode == "subscribe" and expected and hmac.compare_digest(token, expected):
        return Response(challenge, media_type="text/plain")
    raise HTTPException(403, "Verify token does not match WHATSAPP_VERIFY_TOKEN")


@router.post("/webhook")
async def receive(req: Request, db: Session = Depends(get_db)):
    raw = await req.body()
    secret = get_settings().whatsapp_app_secret
    if secret:
        sent = req.headers.get("x-hub-signature-256", "")
        good = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sent, good):
            raise HTTPException(401, "Bad signature")
    else:
        log.warning("WHATSAPP_APP_SECRET is not set: webhook calls are not verified")
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return {"ok": True}
    wa_bot.handle_webhook(db, body)
    return {"ok": True}  # always 200, otherwise Meta keeps retrying


@router.get("/status", response_model=s.WhatsAppStatus)
def status(user: User = Depends(current_user)):
    st = get_settings()
    return s.WhatsAppStatus(
        automatic=whatsapp.automatic(), quotes=whatsapp.quotes_automatic(),
        webhook=whatsapp.automatic() and bool(st.whatsapp_verify_token),
        business_number=("+" + st.whatsapp_business_number.lstrip("+")) if st.whatsapp_business_number else None,
    )
