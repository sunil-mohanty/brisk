"""Optional AI background pictures for campaign banners, kept very cheap.

Only the background photo comes from AI; the offer name, items, price and QR code are drawn on top by us
(designer.py), so they're always exact. Each picture is generated once and stored, then reused for every size and
every post. A monthly cap per business keeps the bill predictable.

Providers (set AI_IMAGE_PROVIDER and AI_IMAGE_KEY on the api service):
  fal     fal.ai, FLUX.1 [schnell]   about USD 0.003 per picture   (default, cheapest)
  openai  OpenAI gpt-image-1, low    about USD 0.01–0.02 per picture
Without a key the button doesn't show; the free designs still work.
"""

import base64
import io
import logging
from datetime import datetime, timezone

import httpx
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import CampaignArt

log = logging.getLogger("salon.ai_art")
_client: httpx.Client | None = None


def client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=90)
    return _client


class ArtError(Exception):
    pass


def enabled() -> bool:
    s = get_settings()
    return bool(s.ai_image_key) and s.ai_image_provider in ("fal", "openai")


def used_this_month(db: Session, business_id: int) -> int:
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return db.scalar(select(func.count(CampaignArt.id)).where(CampaignArt.business_id == business_id, CampaignArt.created_at >= start)) or 0


def left_this_month(db: Session, business_id: int) -> int | None:
    """None when AI isn't set up."""
    if not enabled():
        return None
    return max(0, get_settings().ai_images_per_month - used_this_month(db, business_id))


def _fal(prompt: str) -> bytes:
    s = get_settings()
    url = s.ai_image_url or "https://fal.run/fal-ai/flux/schnell"
    r = client().post(url, headers={"Authorization": f"Key {s.ai_image_key}"},
                      json={"prompt": prompt, "image_size": "portrait_16_9", "num_images": 1, "num_inference_steps": 4,
                            "enable_safety_checker": True})
    if r.status_code >= 300:
        raise ArtError(f"The picture service said: {r.text[:200]}")
    img_url = (r.json().get("images") or [{}])[0].get("url")
    if not img_url:
        raise ArtError("The picture service returned no picture. Try again.")
    if img_url.startswith("data:"):
        return base64.b64decode(img_url.split(",", 1)[1])
    got = client().get(img_url)
    if got.status_code >= 300:
        raise ArtError("Couldn't download the picture. Try again.")
    return got.content


def _openai(prompt: str) -> bytes:
    s = get_settings()
    url = s.ai_image_url or "https://api.openai.com/v1/images/generations"
    r = client().post(url, headers={"Authorization": f"Bearer {s.ai_image_key}"},
                      json={"model": "gpt-image-1", "prompt": prompt, "size": "1024x1536", "quality": "low", "n": 1})
    if r.status_code >= 300:
        raise ArtError(f"The picture service said: {r.text[:200]}")
    data = (r.json().get("data") or [{}])[0]
    if data.get("b64_json"):
        return base64.b64decode(data["b64_json"])
    if data.get("url"):
        return client().get(data["url"]).content
    raise ArtError("The picture service returned no picture. Try again.")


def generate(db: Session, business_id: int, campaign_id: int, prompt: str) -> CampaignArt:
    """Makes one background picture (counts against this month's allowance). The caller commits."""
    s = get_settings()
    if not enabled():
        raise ArtError("AI pictures aren't switched on.")
    if used_this_month(db, business_id) >= s.ai_images_per_month:
        raise ArtError(f"You've used this month's {s.ai_images_per_month} AI pictures. The free designs still work, "
                       "and the allowance resets on the 1st.")
    try:
        raw = _fal(prompt) if s.ai_image_provider == "fal" else _openai(prompt)
    except httpx.HTTPError as e:
        log.warning("AI picture failed: %s", e)
        raise ArtError("Couldn't reach the picture service. Try again in a minute.")
    try:
        im = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:  # noqa: BLE001
        raise ArtError("The picture service sent something that isn't a picture. Try again.")
    if im.width > 1400 or im.height > 2400:  # keep the stored copy small
        im.thumbnail((1400, 2400))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=88, optimize=True)
    art = CampaignArt(business_id=business_id, campaign_id=campaign_id, data=out.getvalue(), prompt=prompt[:2000], provider=s.ai_image_provider)
    db.add(art)
    db.flush()
    return art
