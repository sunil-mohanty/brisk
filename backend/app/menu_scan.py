"""Reads a salon's existing printed menu (photos or a PDF) into services and packages, with an AI vision model.

Nothing is saved here: the owner sees what was read, fixes it and picks what to add.

Providers (set MENU_SCAN_PROVIDER and MENU_SCAN_KEY on the api service):
  anthropic  Claude (default claude-sonnet-5-5). Reads photos and PDFs.  About USD 0.01–0.03 a page.
  openai     OpenAI (default gpt-4.1-mini). Photos only.
Without a key the "Scan your menu" button explains how to switch it on.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx
from PIL import Image, ImageOps

from .config import get_settings
from .models import Business

log = logging.getLogger("salon.menu_scan")
_client: httpx.Client | None = None

MAX_FILES = 6
MAX_BYTES = 15 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=180)
    return _client


class ScanError(Exception):
    pass


@dataclass
class Page:
    data: bytes
    content_type: str


@dataclass
class Found:
    name: str
    price: Decimal | None = None
    price_from: bool = False
    duration_min: int | None = None
    category: str | None = None
    includes: list[dict] = field(default_factory=list)
    note: str | None = None


# ---------- set-up and allowance ----------
def _key() -> str | None:
    s = get_settings()
    if s.menu_scan_key:
        return s.menu_scan_key
    if s.menu_scan_provider == "openai" and s.ai_image_provider == "openai":
        return s.ai_image_key
    return None


def enabled() -> bool:
    return bool(_key()) and get_settings().menu_scan_provider in ("anthropic", "openai")


def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def left(b: Business) -> int | None:
    """Scans left this month; None when scanning isn't set up."""
    if not enabled():
        return None
    used = b.menu_scans if b.menu_scan_month == _month() else 0
    return max(0, get_settings().menu_scans_per_month - used)


def count(b: Business) -> None:
    if b.menu_scan_month != _month():
        b.menu_scan_month, b.menu_scans = _month(), 0
    b.menu_scans += 1


# ---------- reading ----------
PROMPT = """These are photos or pages of a {kind}'s printed menu / price list. Read EVERY service and package on it.

Reply with JSON only, no other text:
{{"currency": "AED", "items": [
  {{"name": "Classic Facial", "price": 150, "price_from": false, "minutes": 60, "category": "Skin", "includes": []}},
  {{"name": "Bridal Glow Package", "price": 499, "price_from": false, "minutes": 180, "category": "Packages",
    "includes": [{{"name": "Classic Facial", "qty": 1}}, {{"name": "Manicure", "qty": 1}}]}}
]}}

Rules:
- name: as written on the menu, in normal capitalisation (not ALL CAPS). Add the variant to the name when the menu
  lists one service with several prices, e.g. "Haircut – Short hair" and "Haircut – Long hair" as two items.
- price: a number only, no currency. If it says "from" / "starting" / "+" set price_from true. If there's no price, null.
  If there's a "was"/old price and a new price, use the new one.
- minutes: only when the menu states a time ("45 min", "1 hr" = 60). Otherwise null.
- category: the menu's own section heading if there is one (Hair, Nails, Skin, Massage, Waxing, Makeup, Men, Bridal…),
  shortened to one or two words.
- includes: ONLY for packages, combos, bundles, offers or deals that group several services for one price: list the
  services inside it (name and qty). For a normal single service use [].
- Don't invent anything that isn't on the menu. Skip addresses, phone numbers, opening hours and slogans.
- currency: the currency shown on the menu (3-letter code), or null if none is shown."""


def _prep(p: Page) -> Page:
    """Photos: upright, at most 2000 px, JPEG. PDFs pass through."""
    if p.content_type == "application/pdf":
        return p
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(p.data)))
        im = im.convert("RGB")
        im.thumbnail((2000, 2000))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=85)
        return Page(out.getvalue(), "image/jpeg")
    except Exception as e:  # not an image after all
        raise ScanError("One of the files isn't a photo we can read. Use JPG, PNG or a PDF.") from e


def _anthropic(pages: list[Page], prompt: str) -> str:
    s = get_settings()
    content: list[dict] = []
    for p in pages:
        b64 = base64.b64encode(p.data).decode()
        if p.content_type == "application/pdf":
            content.append({"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}})
        else:
            content.append({"type": "image", "source": {"type": "base64", "media_type": p.content_type, "data": b64}})
    content.append({"type": "text", "text": prompt})
    r = client().post(
        s.menu_scan_url or "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": _key(), "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": s.menu_scan_model or "claude-sonnet-5-5", "max_tokens": 8000,
              "messages": [{"role": "user", "content": content}]},
    )
    if r.status_code >= 400:
        raise ScanError(_why(r))
    return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")


def _openai(pages: list[Page], prompt: str) -> str:
    s = get_settings()
    if any(p.content_type == "application/pdf" for p in pages):
        raise ScanError("PDF menus need the Claude reader. Take photos of the pages instead, or ask support to switch it on.")
    content: list[dict] = [{"type": "text", "text": prompt}]
    for p in pages:
        content.append({"type": "image_url", "image_url": {"url": f"data:{p.content_type};base64,{base64.b64encode(p.data).decode()}"}})
    r = client().post(
        s.menu_scan_url or "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {_key()}"},
        json={"model": s.menu_scan_model or "gpt-4.1-mini", "max_tokens": 8000, "response_format": {"type": "json_object"},
              "messages": [{"role": "user", "content": content}]},
    )
    if r.status_code >= 400:
        raise ScanError(_why(r))
    return r.json()["choices"][0]["message"]["content"] or ""


def _why(r: httpx.Response) -> str:
    try:
        err = r.json().get("error") or {}
        msg = err.get("message") if isinstance(err, dict) else str(err)
    except ValueError:
        msg = r.text[:200]
    log.warning("Menu scan failed: %s %s", r.status_code, msg)
    if r.status_code in (401, 403):
        return "The menu reader isn't set up correctly (MENU_SCAN_KEY). Ask support."
    if r.status_code == 429 or r.status_code >= 500:
        return "The menu reader is busy. Try again in a minute."
    return f"Couldn't read the menu: {msg}"[:300]


def _num(v) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        d = Decimal(str(v).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        m = re.search(r"\d+(?:\.\d+)?", str(v).replace(",", ""))
        d = Decimal(m.group()) if m else None
    return d.quantize(Decimal("0.01")) if d is not None and d >= 0 else None


def _title(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip(" -–•*·:")
    if name.isupper() and len(name) > 3:  # "CLASSIC FACIAL" → "Classic Facial"
        name = " ".join(w if len(w) <= 3 and w in {"SPA", "UV", "OPI", "CND"} else w.capitalize() for w in name.split())
    return name[:300]


def parse(text: str) -> tuple[list[Found], str | None]:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ScanError("Couldn't find any services on it. Try a sharper, straight photo with the whole menu in view.")
    try:
        data = json.loads(m.group())
    except ValueError as e:
        raise ScanError("Couldn't read the menu clearly. Try again, or a sharper photo.") from e
    out: list[Found] = []
    seen: set[str] = set()
    for it in data.get("items") or []:
        if not isinstance(it, dict) or not str(it.get("name") or "").strip():
            continue
        name = _title(str(it["name"]))
        if name.lower() in seen:
            continue
        seen.add(name.lower())
        mins = it.get("minutes")
        try:
            mins = int(mins) if mins not in (None, "") else None
        except (TypeError, ValueError):
            mins = None
        inc = []
        for x in it.get("includes") or []:
            n = x.get("name") if isinstance(x, dict) else x
            if str(n or "").strip():
                q = x.get("qty", 1) if isinstance(x, dict) else 1
                inc.append({"name": _title(str(n))[:200], "qty": max(1, min(20, int(q) if str(q).isdigit() else 1))})
        cat = str(it.get("category") or "").strip()[:60] or None
        out.append(Found(name=name, price=_num(it.get("price")), price_from=bool(it.get("price_from")),
                         duration_min=mins if mins and 5 <= mins <= 720 else None,
                         category=cat.title() if cat and cat.isupper() else cat, includes=inc[:30]))
    cur = data.get("currency")
    return out[:300], (str(cur).upper()[:3] if cur else None)


def scan(pages: list[Page], kind: str = "salon") -> tuple[list[Found], str | None]:
    if not enabled():
        raise ScanError("Menu scanning isn't switched on yet.")
    if not pages:
        raise ScanError("Add a photo or PDF of your menu.")
    pages = [_prep(p) for p in pages[:MAX_FILES]]
    prompt = PROMPT.format(kind=kind)
    try:
        text = _anthropic(pages, prompt) if get_settings().menu_scan_provider == "anthropic" else _openai(pages, prompt)
    except httpx.HTTPError as e:
        raise ScanError("Couldn't reach the menu reader. Try again in a minute.") from e
    return parse(text)
