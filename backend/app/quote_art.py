"""Pictures and brochures for client quotes.

A quote can carry one optional picture, sent on WhatsApp and shown on the client's quote page:
  upload   an image or PDF brochure from the owner's computer (a quote can be just a brochure, with no items)
  bold / soft / classic   a banner drawn from the quote's items and price (free, see designer.py)
  photo    the same banner over an AI background picture (ai_art.py, counts against the monthly allowance)
"""

import io
from types import SimpleNamespace

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from . import creative, designer
from .logic import quote_url
from .models import CampaignArt, Quote
from .utils import quote_label, valid_until

MAX_BYTES = 10 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
BANNER_STYLES = ("bold", "soft", "classic", "photo")


def as_offer(q: Quote):
    """The quote seen as an offer, so the campaign banner designer can draw it."""
    names = [i.description for i in q.items]
    first = (q.customer.name.split()[0] if q.customer and q.customer.name else "").upper()
    return SimpleNamespace(
        title=q.reference or (" + ".join(names[:3]) if names else "Your quotation"), description=q.notes, items=q.items,
        discount=q.discount, vat_rate=q.vat_rate, valid_until=valid_until(q.created_at, q.valid_days), business=q.business,
        design_style=q.design_style, design_seed=q.design_seed or 0, art_id=q.art_id, token=q.token,
        kicker=f"QUOTE {quote_label(q.number)}" + (f" · FOR {first[:18]}" if first else ""),
    )


def art(db: Session, q: Quote) -> CampaignArt | None:
    """The AI background picture (kept even while another style is chosen)."""
    return db.get(CampaignArt, q.art_id) if q.art_id else None


def file(db: Session, q: Quote) -> CampaignArt | None:
    """The uploaded image or PDF brochure (kept even while another style is chosen)."""
    return db.get(CampaignArt, q.file_id) if q.file_id else None


def picture(db: Session, q: Quote, fmt: str = "portrait") -> tuple[bytes, str] | None:
    """(bytes, content type) of the quote's picture, or None (no picture, or the upload is a PDF)."""
    if q.design_style == "upload":
        f = file(db, q)
        if f and f.content_type.startswith("image/"):
            return f.data, f.content_type
        return None
    a = art(db, q)
    if q.design_style in BANNER_STYLES:
        photo = a.data if (q.design_style == "photo" and a and a.kind == "ai") else None
        if q.design_style == "photo" and not photo:
            return None
        o = as_offer(q)
        if q.design_style == "classic":
            return creative._render_classic(o, quote_url(q), fmt), "image/jpeg"
        return designer.render(o, quote_url(q), fmt, q.design_style, photo), "image/jpeg"
    return None


def version(db: Session, q: Quote) -> str:
    o = as_offer(q)
    return creative.version(o) if q.design_style in BANNER_STYLES else f"{q.design_style}-{q.file_id}"


async def read_upload(db: Session, business_id: int, file: UploadFile) -> CampaignArt:
    """Validates and stores an uploaded image (re-saved, metadata removed) or PDF. The caller links and commits."""
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "That file is over 10 MB. Use a smaller picture or PDF.")
    name = (file.filename or "brochure").rsplit("/", 1)[-1][:200]
    if raw[:5] == b"%PDF-":
        data, ctype = raw, "application/pdf"
    else:
        try:
            im = Image.open(io.BytesIO(raw))
            im = ImageOps.exif_transpose(im)
        except Exception:  # noqa: BLE001
            raise HTTPException(422, "Upload a picture (JPG, PNG, WebP) or a PDF brochure.")
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.getchannel("A"))
            im = bg
        im = im.convert("RGB")
        im.thumbnail((2000, 2000))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=88, optimize=True)
        data, ctype = out.getvalue(), "image/jpeg"
        if not name.lower().endswith((".jpg", ".jpeg")):
            name = name.rsplit(".", 1)[0] + ".jpg"
    a = CampaignArt(business_id=business_id, kind="upload", content_type=ctype, filename=name, data=data,
                    prompt="", provider="upload")
    db.add(a)
    db.flush()
    return a


def attach(q: Quote, a: CampaignArt) -> None:
    a.quote_id = q.id
    q.file_id, q.design_style = a.id, "upload"


def public_bits(db: Session, q: Quote, owner: bool = False):
    """(picture_url, attachment). The client sees only what's chosen; the owner also sees a file kept in reserve."""
    from . import schemas as s
    from .config import get_settings

    base = f"{get_settings().app_url.rstrip('/')}/api/public/q/{q.token}"
    a, f = art(db, q), file(db, q)
    pic = None
    if (q.design_style == "upload" and f and f.content_type.startswith("image/")) or \
            (q.design_style in BANNER_STYLES and (q.design_style != "photo" or (a and a.kind == "ai"))):
        pic = f"{base}/picture/portrait.jpg?v={version(db, q)}"
    att = None
    if f and (owner or q.design_style == "upload"):
        att = s.AttachmentOut(id=f.id, name=f.filename or "brochure", url=f"{base}/file", content_type=f.content_type,
                              is_pdf=f.content_type == "application/pdf")
    return pic, att
