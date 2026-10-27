"""Campaign banners generated from the package text, for free (no AI).

It reads the offer name, "What clients get" and the items, works out the theme (facial, nails, bridal, villa,
sea view…), and draws a banner with matching illustrations and colours in one of three styles:

  classic  the brand look (arch for salons, framed panel for brokers); see creative.py
  bold     dark background, large illustration, left-aligned headline
  soft     light tinted background, round illustration badge, centred headline with item chips
  photo    an AI-generated background picture (optional, see ai_art.py) with the text on top

"Shuffle" changes the seed: which illustration leads, positions and angles. Prices, items and the QR code are
always drawn by us, so they are exact (image AIs can't write text reliably).
"""

import io
import random
import re
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from . import creative as cr
from .models import Campaign
from .utils import quote_totals

ART = Path(__file__).parent / "assets" / "art"
STYLES = ("classic", "bold", "soft", "photo")


@dataclass(frozen=True)
class Theme:
    key: str
    label: str
    icons: tuple[str, ...]
    accent: tuple[int, int, int]
    subject: str  # what an AI background should show
    words: tuple[str, ...]


SALON_THEMES = (
    Theme("bridal", "Bridal", ("gem", "crown", "heart", "sparkles"), (176, 135, 74),
          "elegant bridal beauty setting, soft veil fabric, pearls, white flowers, champagne tones", ("bride", "bridal", "wedding", "henna", "engagement")),
    Theme("nails", "Nails", ("hand", "sparkles", "gem"), (184, 85, 107),
          "luxury manicure table, glossy nail polish bottles, soft pink flowers", ("nail", "mani", "pedi", "gel ", "acrylic", "polish")),
    Theme("lashes", "Lashes & brows", ("eye", "sparkles", "wand-sparkles"), (122, 79, 125),
          "beauty studio with lash and brow tools, soft lilac light", ("lash", "brow", "threading", "lamination")),
    Theme("makeup", "Makeup", ("brush", "eye", "sparkles"), (184, 85, 107),
          "makeup brushes and palettes on a marble vanity, warm glam lighting", ("makeup", "make-up", "glam")),
    Theme("skin", "Skin & facial", ("droplets", "flower-2", "sparkles", "leaf"), (95, 125, 100),
          "luxury facial spa setting, glass serum bottles, gold skincare mask, eucalyptus, soft daylight",
          ("facial", "hydra", "skin", "peel", "glow", "derma", "microderm", "vitamin", "mask", "clean-up", "cleanup", "brighten")),
    Theme("spa", "Spa & massage", ("leaf", "flower-2", "waves", "bath"), (63, 122, 120),
          "calm spa room, rolled towels, massage stones, candles, green leaves", ("massage", "spa", "bath", "moroccan", "reflexology", "scrub", "wellness", "aroma")),
    Theme("colour", "Hair colour", ("palette", "droplets", "sparkles"), (192, 97, 63),
          "salon hair colour bowl and brush, glossy hair strands in caramel tones", ("colour", "color", "balayage", "highlight", "toner", "ombre", "keratin")),
    Theme("barber", "Barber", ("scissors", "star"), (76, 84, 102),
          "classic barbershop chair, straight razor, grooming tools, warm wood", ("beard", "fade", "shave", "barber", "gents", "men's")),
    Theme("hair", "Hair", ("scissors", "wand-sparkles", "sparkles"), (192, 97, 63),
          "modern hair salon station, scissors, brushes, soft light", ("hair", "cut", "blow", "styling", "braid", "extension")),
)
SALON_DEFAULT = Theme("beauty", "Beauty", ("sparkles", "star", "heart"), (192, 97, 63),
                      "elegant beauty salon interior, soft flowers, warm light", ())

RE_THEMES = (
    Theme("sea", "Sea view", ("waves", "building-2", "sun"), (52, 110, 130),
          "modern apartment balcony with sea and marina view at golden hour", ("sea view", "sea-view", "marina", "beach", "waterfront", "palm", "jbr", "bluewaters")),
    Theme("villa", "Villa", ("house", "trees", "sun"), (168, 137, 79),
          "contemporary villa exterior with garden and pool at sunset", ("villa", "townhouse", "garden", "pool", "ranches")),
    Theme("offplan", "Off-plan", ("hammer", "ruler", "building"), (168, 137, 79),
          "architectural model of a new tower, blueprints, modern skyline", ("off-plan", "offplan", "handover", "payment plan", "launch", "pre-launch")),
    Theme("commercial", "Commercial", ("briefcase", "warehouse", "building-2"), (76, 84, 102),
          "bright modern office space with glass walls and city view", ("office", "shop", "retail", "warehouse", "commercial")),
    Theme("rent", "For rent", ("key-round", "bed-double", "calendar-check"), (63, 90, 138),
          "bright furnished apartment living room, keys on a table, city view", ("rent", "lease", "tenancy", "cheque", "yearly", "per year")),
    Theme("apartment", "Apartment", ("building-2", "key-round", "sofa"), (63, 90, 138),
          "elegant modern apartment living room with city skyline view", ("apartment", "flat", "studio", "1br", "2br", "3br", "bed", "penthouse")),
)
RE_DEFAULT = Theme("property", "Property", ("building-2", "key-round", "house"), (63, 90, 138),
                   "modern Dubai residential building with skyline, blue hour", ())


def package_text(c: Campaign) -> str:
    return " ".join([c.title or "", c.description or "", " ".join(i.description for i in c.items)]).lower()


def detect(c: Campaign) -> Theme:
    """The theme with the most keyword hits in the package text (the title counts double)."""
    text = package_text(c)
    title = (c.title or "").lower()
    re_ = cr.is_real_estate(c)
    best, score = (RE_DEFAULT if re_ else SALON_DEFAULT), 0
    for t in RE_THEMES if re_ else SALON_THEMES:
        s = sum(text.count(w) + title.count(w) for w in t.words)
        if s > score:
            best, score = t, s
    return best


# ---------- drawing helpers ----------
@lru_cache(maxsize=64)
def _icon_mask(name: str) -> Image.Image:
    return Image.open(ART / f"{name}.png").convert("RGBA").getchannel("A")


def _paste_icon(img: Image.Image, name: str, size: int, xy: tuple[int, int], color, opacity: float = 1.0, angle: float = 0) -> None:
    m = _icon_mask(name).resize((size, size), Image.LANCZOS)
    if opacity < 1:
        m = m.point(lambda a: int(a * opacity))
    if angle:
        m = m.rotate(angle, resample=Image.BICUBIC, expand=True)
    layer = Image.new("RGB", m.size, color)
    img.paste(layer, (xy[0] - m.size[0] // 2, xy[1] - m.size[1] // 2), m)


def _glow(img: Image.Image, xy, radius: int, color, strength: float = .55) -> None:
    W, H = img.size
    small = 6
    mask = Image.new("L", (W // small, H // small), 0)
    ImageDraw.Draw(mask).ellipse([(xy[0] - radius) // small, (xy[1] - radius) // small, (xy[0] + radius) // small, (xy[1] + radius) // small],
                                 fill=int(255 * strength))
    mask = mask.filter(ImageFilter.GaussianBlur(radius // small // 2)).resize((W, H), Image.BICUBIC)
    img.paste(Image.new("RGB", (W, H), color), (0, 0), mask)


def _mix(a, b, t: float):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _items(c: Campaign) -> list[str]:
    names = [i.description.strip() for i in c.items if i.description.strip()]
    return names or ([c.description.strip()] if c.description else [])


@dataclass
class Ctx:
    W: int
    H: int
    fmt: str
    re_: bool
    P: dict
    theme: Theme
    rnd: random.Random
    price: str
    before: str | None
    until: str | None


def _ctx(c: Campaign, fmt: str) -> Ctx:
    W, H = cr.SIZES.get(fmt, cr.SIZES["portrait"])
    re_ = cr.is_real_estate(c)
    t = quote_totals(c.items, c.discount, c.vat_rate)
    cur = c.business.currency
    before = cr._money(t.subtotal * (1 + Decimal(c.vat_rate) / 100), cur) if t.discount > 0 else None
    until = f"Offer ends {c.valid_until:%d %b}".replace(" 0", " ") if c.valid_until else None
    seed = (c.design_seed or 0) * 7919 + sum(map(ord, c.title or ""))
    return Ctx(W, H, fmt, re_, cr.RE_PALETTE if re_ else cr.SALON_PALETTE, detect(c), random.Random(seed),
               cr._money(t.total, cur), before, until)


def _header(d: ImageDraw.ImageDraw, c: Campaign, x: int, y: int, fg, chip_bg, chip_fg, small=False):
    r = 30 if small else 34
    d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=chip_bg)
    d.text((x + r, y + r + 1), cr._initials(c.business.name), font=cr.display(26 if small else 30), fill=chip_fg, anchor="mm")
    d.text((x + 2 * r + 18, y + r), c.business.name.upper()[:38], font=cr.body(24 if small else 26, True), fill=fg, anchor="lm")
    return y + 2 * r


def _scan_card(img, d, ctx: Ctx, url: str, ink, surface, outline):
    W, H, fmt = ctx.W, ctx.H, ctx.fmt
    M = 72 if fmt != "square" else 64
    q = 230 if fmt == "story" else 170 if fmt == "portrait" else 140
    card_h = q + 48
    cy = H - card_h - (M if fmt != "story" else 130)
    d.rounded_rectangle([M, cy, W - M, cy + card_h], radius=28, fill=surface, outline=outline, width=2)
    img.paste(cr._qr(url, q, ink, surface), (M + 24, cy + 24))
    tx = M + 24 + q + 34
    cta = "Scan to book a viewing" if ctx.re_ else "Scan to accept & book"
    d.text((tx, cy + card_h // 2 - 30), cta, font=cr.display(50 if fmt == "story" else 46 if fmt != "square" else 40), fill=ink, anchor="lm")
    host = url.split("://", 1)[-1]
    for ln in cr._wrap(d, host, cr.body(24), W - M - 24 - tx, 1):
        d.text((tx, cy + card_h // 2 + 30), ln, font=cr.body(24), fill=_mix(ink, surface, .45), anchor="lm")
    return cy


def _plan(d, c: Campaign, ctx: Ctx, room: int, width: int, chips: bool) -> dict:
    """Biggest title that fits with every item (dropping items only as a last resort)."""
    fmt = ctx.fmt
    items = _items(c)
    item_font = cr.body(40 if fmt == "story" else 33 if fmt == "portrait" else 28, True)
    ilh = int(item_font.size * (1.45 if not chips else 1.25))
    pf = cr.display(120 if fmt == "story" else 96 if fmt == "portrait" else 80)
    while d.textlength(ctx.price, font=pf) + 100 > width and pf.size > 48:
        pf = cr.display(pf.size - 6)
    pill_h = int(pf.size * 1.42)
    small = cr.body(28 if fmt != "square" else 24)
    fixed = 50 + 26 + 30 + pill_h + 16 + small.size
    hi, lo = (124, 60) if fmt == "story" else (100, 50) if fmt == "portrait" else (82, 42)
    max_items = 6 if fmt == "story" else 4 if fmt == "portrait" else 3
    best = None
    for keep in range(min(len(items), max_items), 0, -1):
        shown = items[:keep]
        more = len(items) - keep
        rows = len(shown) + (1 if more else 0)
        if chips:
            rows = max(1, (rows + 1) // 2)
        for size in range(hi, lo - 1, -3):
            tf = cr.display(size)
            lines = cr._wrap(d, c.title, tf, width, 4 if fmt == "story" else 3)
            lh = int(tf.size * 1.06)
            need = fixed + lh * len(lines) + ilh * rows
            plan = dict(tf=tf, lines=lines, lh=lh, shown=shown, more=more, item_font=item_font, ilh=ilh, pf=pf, pill_h=pill_h,
                        small=small, need=need, fits=need <= room and not lines[-1].endswith("…"))
            if plan["fits"]:
                return plan
            best = best or plan
        if keep <= 3:  # keep at least 3 items visible when there are that many; let the title shrink instead
            break
    return {**best, "tf": cr.display(lo), "lines": cr._wrap(d, c.title, cr.display(lo), width, 3), "lh": int(lo * 1.06), "fits": False}


def _text_block(d, c: Campaign, ctx: Ctx, x: int, top: int, bottom: int, width: int, ink, soft, accent, on_accent, align="left", plan=None):
    """Label, title, items and price, fitted between top and bottom. Draws in place."""
    fmt = ctx.fmt
    room = bottom - top
    p = plan or _plan(d, c, ctx, room, width, align != "left")
    tf, lines, lh, shown, more = p["tf"], p["lines"], p["lh"], p["shown"], p["more"]
    item_font, ilh, pf, pill_h, small, need = p["item_font"], p["ilh"], p["pf"], p["pill_h"], p["small"], p["need"]
    label_h = 50
    gap = max(0, room - need) // 3
    y = top + gap
    cx = x + width // 2
    label = getattr(c, "kicker", None) or (("EXCLUSIVE OFFER" if ctx.re_ else "SPECIAL OFFER") + f" · {ctx.theme.label.upper()}")
    if align == "left":
        d.text((x, y), label, font=cr.body(24, True), fill=accent)
    else:
        d.text((cx, y), label, font=cr.body(24, True), fill=accent, anchor="ma")
    y += label_h
    for ln in lines:
        if align == "left":
            d.text((x, y), ln, font=tf, fill=ink)
        else:
            d.text((cx, y), ln, font=tf, fill=ink, anchor="ma")
        y += lh
    y += 26
    if align == "left":
        for name in shown:
            txt = cr._wrap(d, name, item_font, width - 40, 1)[0]
            d.ellipse([x, y + item_font.size * .55 - 7, x + 14, y + item_font.size * .55 + 7], fill=accent)
            d.text((x + 30, y), txt, font=item_font, fill=soft)
            y += ilh
        if more:
            d.text((x + 30, y), f"+ {more} more", font=cr.body(item_font.size), fill=soft)
            y += ilh
    else:  # chips, wrapped and centred
        chip_font = cr.body(item_font.size - 4, True)
        rows, row, row_w = [], [], 0
        labels = [cr._wrap(d, n, chip_font, width - 60, 1)[0] for n in shown] + ([f"+{more} more"] if more else [])
        for t_ in labels:
            w_ = d.textlength(t_, font=chip_font) + 44
            if row and row_w + w_ + 12 > width:
                rows.append((row, row_w))
                row, row_w = [], 0
            row.append((t_, w_))
            row_w += w_ + (12 if row_w else 0)
        if row:
            rows.append((row, row_w))
        ch = int(chip_font.size * 1.9)
        for r_, rw in rows[:3]:
            xx = cx - rw / 2
            for t_, w_ in r_:
                d.rounded_rectangle([xx, y, xx + w_, y + ch], radius=ch // 2, fill=on_accent, outline=_mix(accent, on_accent, .55), width=2)
                d.text((xx + w_ / 2, y + ch / 2), t_, font=chip_font, fill=ink, anchor="mm")
                xx += w_ + 12
            y += ch + 12
    y += 30 + gap
    pw = int(d.textlength(ctx.price, font=pf)) + 100
    px = x if align == "left" else cx - pw // 2
    d.rounded_rectangle([px, y, px + pw, y + pill_h], radius=pill_h // 2, fill=accent)
    d.text((px + pw // 2, y + pill_h // 2 + 3), ctx.price, font=pf, fill=on_accent, anchor="mm")
    y += pill_h + 16
    bits = [b for b in (("was " + ctx.before) if ctx.before else None, "incl. VAT" if Decimal(c.vat_rate) > 0 else None, ctx.until) if b]
    if bits:
        s = "  ·  ".join(bits)
        if align == "left":
            d.text((x + 8, y), s, font=small, fill=soft)
        else:
            d.text((cx, y), s, font=small, fill=soft, anchor="ma")


# ---------- styles ----------
def _bold(c: Campaign, url: str, ctx: Ctx) -> Image.Image:
    W, H, P, th, rnd = ctx.W, ctx.H, ctx.P, ctx.theme, ctx.rnd
    bg = P["ACCENT_DEEP"] if ctx.re_ else P["INK"]
    img = Image.new("RGB", (W, H), bg)
    accent = th.accent if not ctx.re_ else _mix(th.accent, (255, 255, 255), .15)
    _glow(img, (int(W * rnd.uniform(.62, .85)), int(H * rnd.uniform(.12, .25))), int(W * .55), accent, .5)
    _glow(img, (int(W * rnd.uniform(.0, .25)), int(H * .62)), int(W * .4), _mix(accent, bg, .4), .35)
    icons = list(th.icons)
    rnd.shuffle(icons)
    M = 72 if ctx.fmt != "square" else 64
    d = ImageDraw.Draw(img)
    head_y = 64 if ctx.fmt != "story" else 110
    cy0 = ctx.H - (230 if ctx.fmt == "story" else 170 if ctx.fmt == "portrait" else 140) - 48 - (M if ctx.fmt != "story" else 130)
    hx, hy = int(W * rnd.uniform(.66, .74)), int(H * (.21 if ctx.fmt == "story" else .2 if ctx.fmt == "portrait" else .24))
    plan = None
    for k in (.40, .34, .28, .22, .16) if ctx.fmt != "square" else (.30, .24, .18, .12):
        hero = int(W * k)
        top = max(head_y + 68 + 40, int(hy + hero * (.42 if ctx.fmt != "square" else .1)))
        plan = _plan(d, c, ctx, cy0 - 40 - top, W - 2 * M, False)
        if plan["fits"]:
            break
    _paste_icon(img, icons[0], hero, (hx, hy), _mix(accent, (255, 255, 255), .25), .95, rnd.uniform(-12, 12))
    for i, name in enumerate(icons[1:3]):
        _paste_icon(img, name, int(hero * rnd.uniform(.35, .5)), (int(hx + (-1) ** i * hero * .62), int(hy + rnd.uniform(-.45, .55) * hero)),
                    (255, 255, 255), .22, rnd.uniform(-25, 25))
    d = ImageDraw.Draw(img)
    head = _header(d, c, M, head_y, (255, 255, 255), accent, (255, 255, 255))
    surface = (252, 251, 249)
    cy = _scan_card(img, d, ctx, url, P["INK"], surface, surface)
    top = max(head + 40, int(hy + hero * (.42 if ctx.fmt != "square" else .1)))
    _text_block(d, c, ctx, M, top, cy - 40, W - 2 * M, (255, 255, 255), (214, 219, 228), accent, (255, 255, 255), plan=plan)
    return img


def _soft(c: Campaign, url: str, ctx: Ctx) -> Image.Image:
    W, H, P, th, rnd = ctx.W, ctx.H, ctx.P, ctx.theme, ctx.rnd
    accent = th.accent
    bg = _mix(accent, (255, 255, 255), .88)
    img = Image.new("RGB", (W, H), bg)
    icons = list(th.icons)
    rnd.shuffle(icons)
    for _ in range(6):  # faint pattern
        _paste_icon(img, rnd.choice(icons), rnd.randint(90, 170), (rnd.randint(0, W), rnd.randint(0, int(H * .7))), accent, .10, rnd.uniform(-30, 30))
    d = ImageDraw.Draw(img)
    M = 72 if ctx.fmt != "square" else 64
    head = _header(d, c, M, 64 if ctx.fmt != "story" else 110, P["INK"], accent, (255, 255, 255))
    cy0 = ctx.H - (230 if ctx.fmt == "story" else 170 if ctx.fmt == "portrait" else 140) - 48 - (M if ctx.fmt != "story" else 130)
    plan = None
    for k in (.17, .14, .11, .08, .06) if ctx.fmt != "square" else (.11, .085, .06, .045):
        R = int(W * k)
        cyc = head + 40 + R
        plan = _plan(d, c, ctx, cy0 - 36 - (cyc + R + 34), W - 2 * M, True)
        if plan["fits"]:
            break
    d.ellipse([W // 2 - R - 14, cyc - R - 14, W // 2 + R + 14, cyc + R + 14], fill=_mix(accent, (255, 255, 255), .7))
    d.ellipse([W // 2 - R, cyc - R, W // 2 + R, cyc + R], fill=accent)
    _paste_icon(img, icons[0], int(R * 1.15), (W // 2, cyc), (255, 255, 255), 1.0, 0)
    cy = _scan_card(img, d, ctx, url, P["INK"], (255, 255, 255), _mix(accent, (255, 255, 255), .6))
    _text_block(d, c, ctx, M, cyc + R + 34, cy - 36, W - 2 * M, P["INK"], P["MUTED"], _mix(accent, P["INK"], .15), (255, 255, 255), align="center", plan=plan)
    return img


def _photo(c: Campaign, url: str, ctx: Ctx, photo: bytes) -> Image.Image:
    W, H, P = ctx.W, ctx.H, ctx.P
    src = Image.open(io.BytesIO(photo)).convert("RGB")
    s = max(W / src.width, H / src.height)
    src = src.resize((int(src.width * s) + 1, int(src.height * s) + 1), Image.LANCZOS)
    img = src.crop(((src.width - W) // 2, (src.height - H) // 2, (src.width - W) // 2 + W, (src.height - H) // 2 + H))
    # darken towards the bottom so white text always reads
    shade = Image.new("L", (1, H))
    for y in range(H):
        t = max(0.0, (y / H - .18) / .82)
        shade.putpixel((0, y), int(255 * min(.9, .25 + t * .85)))
    shade = shade.resize((W, H))
    dark = P["ACCENT_DEEP"] if ctx.re_ else P["INK"]
    img.paste(Image.new("RGB", (W, H), dark), (0, 0), shade)
    d = ImageDraw.Draw(img)
    M = 72 if ctx.fmt != "square" else 64
    accent = _mix(ctx.theme.accent, (255, 255, 255), .25)
    head = _header(d, c, M, 64 if ctx.fmt != "story" else 110, (255, 255, 255), accent, (255, 255, 255))
    surface = (252, 251, 249)
    cy = _scan_card(img, d, ctx, url, P["INK"], surface, surface)
    top = max(head + 40, int(H * (.36 if ctx.fmt != "square" else .22)))
    _text_block(d, c, ctx, M, top, cy - 40, W - 2 * M, (255, 255, 255), (226, 229, 235), accent, (255, 255, 255))
    return img


def render(c: Campaign, url: str, fmt: str, style: str, photo: bytes | None = None) -> bytes:
    ctx = _ctx(c, fmt)
    if style == "photo" and photo:
        img = _photo(c, url, ctx, photo)
    elif style == "soft":
        img = _soft(c, url, ctx)
    else:
        img = _bold(c, url, ctx)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()


def ai_prompt(c: Campaign) -> str:
    """A background-only prompt: the scene from the theme, plus the package's own words. Never asks for text."""
    th = detect(c)
    words = re.sub(r"[^a-zA-Z0-9 ,&+\-]", " ", " ".join([c.title or ""] + [i.description for i in c.items[:4]]))[:160]
    return (f"Premium advertising photograph, {th.subject}. Inspired by: {words}. Elegant, minimal, soft natural light, "
            "shallow depth of field, rich but calm colours, plenty of empty space in the lower half. "
            "No text, no letters, no numbers, no logos, no watermark, no people's faces.")


def described_prompt(description: str, has_reference: bool = False) -> str:
    """The owner's own words, kept safe and text-free."""
    words = re.sub(r"[^\w ,.&+\-'()/%]", " ", description, flags=re.UNICODE)
    words = " ".join(words.split())[:400]
    lead = "Based on the reference photo, create" if has_reference else "Create"
    return (f"{lead} a premium advertising photograph: {words}. Elegant, minimal, soft natural light, rich but calm colours, "
            "plenty of empty space in the lower half. No text, no letters, no numbers, no logos, no watermark.")
