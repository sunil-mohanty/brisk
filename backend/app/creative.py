"""Ready-to-post pictures and a short video for a campaign: title, price, "offer ends", and a QR code to the offer
page, so a client can scan from a post or a story and accept and book.

  square   1080×1080  Facebook, Instagram feed
  portrait 1080×1350  Instagram feed (takes the most space)
  story    1080×1920  Instagram / Facebook stories, YouTube Shorts (the video is made from this)
"""

import hashlib
import io
import os
import subprocess
import tempfile
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFont

from .models import Campaign
from .utils import quote_totals

ASSETS = Path(__file__).parent / "assets"
SIZES = {"square": (1080, 1080), "portrait": (1080, 1350), "story": (1080, 1920)}

CREAM = (244, 236, 231)
SURFACE = (251, 248, 245)
INK = (42, 31, 26)
MUTED = (135, 115, 106)
ACCENT = (192, 97, 63)
ACCENT_DEEP = (162, 78, 48)
ACCENT_SOFT = (246, 220, 207)
ON_ACCENT = (255, 250, 246)


@lru_cache
def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(ASSETS / name), size)


def display(size: int):
    return _font("Gloock-Regular.ttf", size)


def body(size: int, bold: bool = False):
    return _font("HankenGrotesk-Bold.ttf" if bold else "HankenGrotesk-Medium.ttf", size)


def _wrap(d: ImageDraw.ImageDraw, text: str, font, width: int, max_lines: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if d.textlength(t, font=font) <= width:
            cur = t
            continue
        if cur:
            lines.append(cur)
        cur = w
        if len(lines) == max_lines:
            break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines and " ".join(lines) != " ".join(words):
        last = lines[-1]
        while last and d.textlength(last + "…", font=font) > width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def _fit_title(d, text: str, width: int, sizes: tuple[int, ...], max_lines: int):
    for size in sizes:
        f = display(size)
        lines = _wrap(d, text, f, width, max_lines)
        if not lines[-1].endswith("…"):
            return f, lines
    return f, lines


def _money(v: Decimal, cur: str) -> str:
    v = Decimal(v)
    return f"{cur} {v:,.0f}" if v == v.to_integral() else f"{cur} {v:,.2f}"


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p[:1].isalpha()]
    return ((parts[0][0] if parts else "") + (parts[1][0] if len(parts) > 1 else "")).upper() or "•"


def _qr(url: str, px: int) -> Image.Image:
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="png", scale=10, border=0, dark="#2a1f1a", light="#fbf8f5")
    buf.seek(0)
    return Image.open(buf).convert("RGB").resize((px, px), Image.NEAREST)


def version(c: Campaign) -> str:
    """Changes when anything on the picture changes (for cache-busting preview URLs)."""
    key = "|".join([c.title, c.description or "", str(c.discount), str(c.vat_rate), str(c.valid_until), c.business.name,
                    c.business.currency] + [f"{i.description}:{i.quantity}:{i.unit_price}" for i in c.items])
    return hashlib.sha1(key.encode()).hexdigest()[:10]


def render(c: Campaign, url: str, fmt: str = "portrait") -> bytes:
    W, H = SIZES.get(fmt, SIZES["portrait"])
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    M = 72 if fmt != "square" else 64
    b = c.business
    cur = b.currency
    t = quote_totals(c.items, c.discount, c.vat_rate)
    before = (t.subtotal * (1 + Decimal(c.vat_rate) / 100)) if t.discount > 0 else None

    tall = fmt == "story"
    sq = fmt == "square"

    # Salon header
    y = 64 if not tall else 110
    r = 34
    d.ellipse([M, y, M + 2 * r, y + 2 * r], fill=ACCENT)
    d.text((M + r, y + r + 1), _initials(b.name), font=display(30), fill=ON_ACCENT, anchor="mm")
    d.text((M + 2 * r + 20, y + r), b.name.upper()[:38], font=body(26, True), fill=INK, anchor="lm")
    header_end = y + 2 * r

    # Scan card at the bottom
    q = 230 if tall else 170 if fmt == "portrait" else 140
    card_h = q + 48
    cy = H - card_h - (M if not tall else 130)

    # Measure the middle: label, title, items, price pill, small print
    arch_w = W - 2 * M + 40
    inner = arch_w - 150
    tf, lines = _fit_title(d, c.title, inner, (124, 108, 96, 84, 72) if tall else (100, 88, 78, 68, 60) if not sq else (86, 76, 66, 58, 52), 3)
    lh = int(tf.size * 1.08)
    sub_font = body(34 if tall else 30 if not sq else 26)
    extra = " · ".join(i.description for i in c.items[:4]) if not sq or not c.description else c.description
    extra_lines = _wrap(d, extra, sub_font, inner, 1 if sq else 2) if extra else []
    pf = display(150 if tall else 116 if not sq else 92)
    price = _money(t.total, cur)
    pill_w, pill_h = int(d.textlength(price, font=pf)) + 110, int(pf.size * 1.45)
    small = body(30 if not sq else 26)
    label_h = 46
    content_h = label_h + lh * len(lines) + 14 + int(sub_font.size * 1.35) * len(extra_lines)
    after_h = pill_h + 22 + small.size + 10  # pill + small print under it
    arch_top = header_end + (46 if not tall else 90)
    curve_pad = int(arch_w * (0.17 if not sq else 0.13))  # keep text inside the arch's curve
    free = (cy - 36) - (arch_top + curve_pad) - content_h - after_h
    gap = max(24, free // 2)
    top = arch_top + curve_pad + max(0, free - 2 * gap) // 2

    # The arch (the brand's mirror motif); it ends at the middle of the price pill
    pill_cy = top + content_h + gap + pill_h // 2
    x0 = (W - arch_w) // 2
    d.pieslice([x0, arch_top, x0 + arch_w, arch_top + arch_w], 180, 360, fill=ACCENT_SOFT)
    d.rectangle([x0, arch_top + arch_w // 2, x0 + arch_w, max(arch_top + arch_w // 2, pill_cy)], fill=ACCENT_SOFT)

    y = top
    d.text((W // 2, y + 12), "SPECIAL OFFER", font=body(24 if not tall else 28, True), fill=ACCENT_DEEP, anchor="mm")
    y += label_h
    for ln in lines:
        d.text((W // 2, y), ln, font=tf, fill=INK, anchor="ma")
        y += lh
    y += 14
    for ln in extra_lines:
        d.text((W // 2, y), ln, font=sub_font, fill=MUTED, anchor="ma")
        y += int(sub_font.size * 1.35)

    # Price
    px = (W - pill_w) // 2
    d.rounded_rectangle([px, pill_cy - pill_h // 2, px + pill_w, pill_cy + pill_h // 2], radius=pill_h // 2, fill=ACCENT)
    d.text((W // 2, pill_cy + 4), price, font=pf, fill=ON_ACCENT, anchor="mm")
    y = pill_cy + pill_h // 2 + 22
    parts = []
    if before and before > t.total:
        parts.append(("was " + _money(before, cur), True))
    if Decimal(c.vat_rate) > 0:
        parts.append(("incl. VAT", False))
    if c.valid_until:
        parts.append((f"ends {c.valid_until:%d %b}".replace(" 0", " "), False))
    widths = [d.textlength(s_, font=small) for s_, _ in parts]
    sp = 34
    sx = (W - (sum(widths) + sp * (len(parts) - 1))) / 2
    for (s_, strike), w in zip(parts, widths):
        d.text((sx, y), s_, font=small, fill=MUTED)
        if strike:
            d.line([sx, y + small.size * 0.62, sx + w, y + small.size * 0.62], fill=MUTED, width=3)
        sx += w + sp

    # Scan card
    d.rounded_rectangle([M, cy, W - M, cy + card_h], radius=28, fill=SURFACE, outline=(220, 202, 190), width=2)
    img.paste(_qr(url, q), (M + 24, cy + 24))
    tx = M + 24 + q + 34
    d.text((tx, cy + card_h // 2 - 30), "Scan to accept & book", font=display(50 if tall else 46 if not sq else 40), fill=INK, anchor="lm")
    host = url.split("://", 1)[-1]
    for ln in _wrap(d, host, body(24), W - M - 24 - tx, 1):
        d.text((tx, cy + card_h // 2 + 30), ln, font=body(24), fill=MUTED, anchor="lm")

    out = io.BytesIO()
    img.save(out, "JPEG", quality=90, optimize=True, progressive=False)
    return out.getvalue()


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return "ffmpeg"


def video(c: Campaign, url: str, seconds: int = 8) -> bytes:
    """A vertical 1080×1920 MP4 (YouTube Shorts): the story picture with a slow zoom and a fade in/out."""
    frames = seconds * 30
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, "in.jpg"), os.path.join(tmp, "out.mp4")
        with open(src, "wb") as fh:
            fh.write(render(c, url, "story"))
        vf = (f"scale=2160:3840,zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1080x1920:fps=30,"
              f"fade=t=in:st=0:d=0.6,fade=t=out:st={seconds - 0.8}:d=0.8,format=yuv420p")
        cmd = [ffmpeg_exe(), "-y", "-loglevel", "error", "-loop", "1", "-i", src,
               "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
               "-vf", vf, "-t", str(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
               "-c:a", "aac", "-shortest", "-movflags", "+faststart", dst]
        subprocess.run(cmd, check=True, timeout=180)
        with open(dst, "rb") as fh:
            return fh.read()
