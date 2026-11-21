"""Meta's webhook for Facebook Pages and Instagram: comments, reactions and direct messages on the salons' accounts.

Callback URL in the Meta app (Webhooks): https://<your web domain>/api/social/webhook, objects Page (feed, messages)
and Instagram (comments, messages). The verify token is META_WEBHOOK_VERIFY_TOKEN (or WHATSAPP_VERIFY_TOKEN).
"""

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from .. import social_bot
from ..config import get_settings
from ..db import get_db

router = APIRouter(prefix="/social", tags=["social webhook"])
log = logging.getLogger("salon.social")


def _verify_token() -> str | None:
    st = get_settings()
    return st.meta_webhook_verify_token or st.whatsapp_verify_token


@router.get("/webhook")
def verify(mode: str = Query(alias="hub.mode", default=""), token: str = Query(alias="hub.verify_token", default=""),
           challenge: str = Query(alias="hub.challenge", default="")):
    expected = _verify_token()
    if mode == "subscribe" and expected and hmac.compare_digest(token, expected):
        return Response(challenge, media_type="text/plain")
    raise HTTPException(403, "Verify token does not match META_WEBHOOK_VERIFY_TOKEN")


@router.post("/webhook")
async def receive(req: Request, db: Session = Depends(get_db)):
    raw = await req.body()
    st = get_settings()
    secrets = [x for x in (st.meta_app_secret, st.whatsapp_app_secret) if x]
    if secrets:
        sent = req.headers.get("x-hub-signature-256", "")
        if not any(hmac.compare_digest(sent, "sha256=" + hmac.new(x.encode(), raw, hashlib.sha256).hexdigest()) for x in secrets):
            log.warning("Facebook/Instagram webhook refused: the signature doesn't match META_APP_SECRET.")
            raise HTTPException(401, "Bad signature")
    else:
        log.warning("META_APP_SECRET is not set: Facebook/Instagram webhook calls are not verified")
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return {"ok": True}
    n = social_bot.handle_webhook(db, body)
    log.info("%s webhook: %s event(s) handled", body.get("object"), n)
    return {"ok": True}
