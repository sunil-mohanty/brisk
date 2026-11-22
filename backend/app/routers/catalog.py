"""Service menu: what the salon offers, with price and time. Used on quotes, bookings and the link page.

A package is a menu item that bundles other services ("Bridal Glow: Facial + Manicure + Pedicure") for one price.
It works everywhere a service does. The menu can also be read from photos of the salon's printed menu.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import menu_scan
from .. import schemas as s
from ..db import get_db
from ..logic import get_owned
from ..models import Business, CatalogItem, User
from ..security import current_user
from ..utils import money

router = APIRouter(prefix="/catalog", tags=["catalog"])
MAX_ITEMS = 300


def _key(name: str) -> str:
    return " ".join(name.lower().split())


def _parts(includes) -> list[dict]:
    out, seen = [], set()
    for p in includes or []:
        d = p.model_dump() if hasattr(p, "model_dump") else dict(p)
        name = " ".join(str(d.get("name") or "").split())[:300]
        if name and _key(name) not in seen:
            seen.add(_key(name))
            out.append({"name": name, "qty": max(1, min(20, int(d.get("qty") or 1)))})
    return out[:30]


def _package_minutes(items: list[CatalogItem], parts: list[dict]) -> int | None:
    """A package without its own time takes as long as its services together (when the menu knows them)."""
    by = {_key(c.name): c for c in items}
    total = sum((by[_key(p["name"])].duration_min or 0) * p["qty"] for p in parts if _key(p["name"]) in by)
    return min(720, total) if total >= 5 else None


def _out(items: list[CatalogItem]) -> list[s.CatalogOut]:
    by = {_key(c.name): c for c in items}
    out = []
    for c in items:
        o = s.CatalogOut.model_validate(c)
        if c.includes:
            known = [by[_key(p["name"])] for p in c.includes if _key(p["name"]) in by]
            if known:
                o.worth = sum((money(by[_key(p["name"])].unit_price) * p.get("qty", 1)
                               for p in c.includes if _key(p["name"]) in by), Decimal("0"))
        out.append(o)
    return out


def _all(db: Session, business_id: int) -> list[CatalogItem]:
    return db.scalars(
        select(CatalogItem).where(CatalogItem.business_id == business_id)
        .order_by(CatalogItem.category.is_(None), CatalogItem.category, CatalogItem.uses.desc(), func.lower(CatalogItem.name))
    ).all()


@router.get("", response_model=list[s.CatalogOut])
def list_items(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(_all(db, user.business_id))


@router.post("", response_model=list[s.CatalogOut], status_code=201)
def add_items(body: list[s.CatalogIn], user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Adds lines; a name that already exists updates its price instead of duplicating."""
    existing = {_key(c.name): c for c in db.scalars(select(CatalogItem).where(CatalogItem.business_id == user.business_id))}
    touched: list[CatalogItem] = []
    for item in body[:MAX_ITEMS]:
        key = _key(item.name)
        c = existing.get(key)
        if c:
            c.unit_price = money(item.unit_price)
            if item.category:
                c.category = item.category.strip()
            if item.duration_min:
                c.duration_min = item.duration_min
        elif len(existing) < MAX_ITEMS:
            c = CatalogItem(business_id=user.business_id, name=" ".join(item.name.split()), unit_price=money(item.unit_price),
                            category=(item.category or "").strip() or None, duration_min=item.duration_min)
            db.add(c)
            existing[key] = c
        else:
            continue
        if item.price_from is not None:
            c.price_from = item.price_from
        if item.includes is not None:
            c.includes = _parts(item.includes)
        touched.append(c)
    for c in touched:  # after all are in, so a package can count services added in the same go
        if c.includes and not c.duration_min:
            c.duration_min = _package_minutes(list(existing.values()), c.includes)
    db.commit()
    return list_items(user, db)


@router.post("/used", status_code=204)
def mark_used(names: list[str], user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Counts which lines go into quotes, so the most used appear first."""
    wanted = {_key(n) for n in names[:50]}
    for c in db.scalars(select(CatalogItem).where(CatalogItem.business_id == user.business_id)):
        if _key(c.name) in wanted:
            c.uses += 1
    db.commit()


# ---------- reading a printed menu ----------
@router.get("/scan", response_model=s.ScanStatus)
def scan_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(Business, user.business_id)
    from ..config import get_settings
    return s.ScanStatus(enabled=menu_scan.enabled(), left=menu_scan.left(b), per_month=get_settings().menu_scans_per_month)


@router.post("/scan", response_model=s.ScanOut)
async def scan(files: list[UploadFile] = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Reads photos / a PDF of the salon's menu. Returns what it found for the owner to check; saves nothing."""
    b = db.get(Business, user.business_id)
    if not menu_scan.enabled():
        raise HTTPException(503, "Menu scanning isn't switched on yet. Add your services by hand for now.")
    if menu_scan.left(b) == 0:
        raise HTTPException(429, "You've used this month's menu scans. Add the rest by hand, or try again next month.")
    if len(files) > menu_scan.MAX_FILES:
        raise HTTPException(422, f"Up to {menu_scan.MAX_FILES} photos or pages at a time.")
    pages = []
    for f in files:
        data = await f.read(menu_scan.MAX_BYTES + 1)
        if len(data) > menu_scan.MAX_BYTES:
            raise HTTPException(413, f"{f.filename or 'A file'} is over 15 MB. Use a smaller photo.")
        ctype = (f.content_type or "").lower()
        if ctype == "application/pdf" or (f.filename or "").lower().endswith(".pdf"):
            ctype = "application/pdf"
        elif ctype not in menu_scan.IMAGE_TYPES:
            raise HTTPException(415, "Use photos (JPG, PNG, WebP) or a PDF of your menu.")
        pages.append(menu_scan.Page(data, ctype))
    kind = "real estate agency" if (b.business_type or "") == "real_estate" else "salon / spa"
    try:
        found, currency = menu_scan.scan(pages, kind)
    except menu_scan.ScanError as e:
        raise HTTPException(422, str(e))
    menu_scan.count(b)
    db.commit()
    existing = {_key(c.name): c for c in db.scalars(select(CatalogItem).where(CatalogItem.business_id == b.id))}
    items = []
    for f in found:
        c = existing.get(_key(f.name))
        items.append(s.ScanItemOut(name=f.name, unit_price=f.price, price_from=f.price_from, duration_min=f.duration_min,
                                   category=f.category, includes=f.includes, existing_id=c.id if c else None,
                                   existing_price=c.unit_price if c else None))
    return s.ScanOut(items=items, currency=currency, left=menu_scan.left(b))


@router.patch("/{item_id}", response_model=s.CatalogOut)
def update_item(item_id: int, body: s.CatalogUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_owned(db, CatalogItem, item_id, user.business_id, "Price list item")
    for k, v in body.model_dump(exclude_unset=True).items():
        if k == "category":
            v = (v or "").strip() or None
        if k == "includes":
            c.includes = _parts(v)
            continue
        setattr(c, k, v.strip() if isinstance(v, str) else money(v) if k == "unit_price" else v)
    if "includes" in body.model_fields_set and c.includes and "duration_min" not in body.model_fields_set:
        c.duration_min = _package_minutes(_all(db, user.business_id), c.includes) or c.duration_min
    db.commit()
    db.refresh(c)
    return next(o for o in _out(_all(db, user.business_id)) if o.id == c.id)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, CatalogItem, item_id, user.business_id, "Price list item"))
    db.commit()
