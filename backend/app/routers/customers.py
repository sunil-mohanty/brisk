from collections import Counter
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from ..activity import record
from .. import schemas as s
from ..db import get_db
from ..importer import MAX_ROWS, Row, clean_phone, finish_rows, parse_file, parse_text
from ..logic import get_owned
from ..models import Business, Customer, Quote, QuoteStatus, User
from ..utils import quote_totals
from ..security import current_user

router = APIRouter(prefix="/customers", tags=["customers"])


def _summary(c: Customer) -> s.CustomerSummary:
    leads = sorted(c.leads, key=lambda l: l.created_at)
    # Value = finished jobs + accepted quotes that have no service record yet (so nothing is counted twice).
    ltv = sum((r.amount for r in c.services), Decimal("0"))
    ltv += sum(
        (quote_totals(q.items, q.discount, q.vat_rate).total for q in c.quotes
         if q.status == QuoteStatus.accepted and not q.service_records),
        Decimal("0"),
    )
    if c.services:
        stage = "Retain"
    elif any(q.status == QuoteStatus.accepted for q in c.quotes):
        stage = "Serve"
    elif c.quotes:
        stage = "Quote"
    else:
        stage = "Acquire"
    return s.CustomerSummary(
        **s.CustomerOut.model_validate(c).model_dump(),
        first_source=leads[0].source if leads else None,
        leads=len(c.leads),
        quotes=len(c.quotes),
        services=len(c.services),
        lifetime_value=ltv,
        stage=stage,
    )


MAX_CATEGORIES = 4


def clean_tags(tags: list[str]) -> list[str]:
    """Trimmed and de-duplicated (ignoring case), names of at most 30 characters."""
    out: list[str] = []
    for t in tags:
        t = " ".join((t or "").replace(",", " ").split())[:30]
        if t and t.lower() not in {x.lower() for x in out}:
            out.append(t)
    return out


def has_tag(c: Customer, tag: str) -> bool:
    return tag.lower() in {t.lower() for t in (c.tags or [])}


def _categories(db: Session, business_id: int) -> list[str]:
    return list(db.get(Business, business_id).client_categories or [])


def _as_categories(db: Session, business_id: int, names: list[str]) -> list[str]:
    """Maps names to the business's categories (their spelling). Unknown names are refused."""
    cats = {c.lower(): c for c in _categories(db, business_id)}
    out = []
    for n in clean_tags(names):
        if n.lower() not in cats:
            raise HTTPException(422, f"“{n}” isn't one of your categories. Add it under Manage categories first.")
        out.append(cats[n.lower()])
    return out


def _categories_out(db: Session, business_id: int) -> s.CategoriesOut:
    cats = _categories(db, business_id)
    counts: Counter[str] = Counter()
    none = 0
    for tags in db.scalars(select(Customer.tags).where(Customer.business_id == business_id)):
        tags = [t.lower() for t in tags or []]
        counts.update(tags)
        none += not tags
    return s.CategoriesOut(categories=[s.TagCount(name=c, count=counts[c.lower()]) for c in cats],
                           uncategorised=none, max=MAX_CATEGORIES)


@router.get("/categories", response_model=s.CategoriesOut)
def list_categories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The owner's categories, with how many clients are in each, and how many are in none."""
    return _categories_out(db, user.business_id)


@router.put("/categories", response_model=s.CategoriesOut)
def save_categories(body: s.CategoriesIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Create, rename or remove categories. Renames carry the clients along; removing one takes it off its clients."""
    names = [" ".join(c.name.split())[:30] for c in body.categories]
    if any(not n for n in names):
        raise HTTPException(422, "Give every category a name.")
    if len({n.lower() for n in names}) != len(names):
        raise HTTPException(422, "Two categories have the same name.")
    if len(names) > MAX_CATEGORIES:
        raise HTTPException(422, f"You can have up to {MAX_CATEGORIES} categories.")
    b = db.get(Business, user.business_id)
    old = {c.lower(): c for c in b.client_categories or []}
    rename = {c.was.strip().lower(): n for c, n in zip(body.categories, names) if c.was and c.was.strip().lower() in old}
    for cu in db.scalars(select(Customer).where(Customer.business_id == user.business_id)):
        if not cu.tags:
            continue
        nxt = clean_tags([rename[t.lower()] for t in cu.tags if t.lower() in rename])
        if nxt != cu.tags:
            cu.tags = nxt
    b.client_categories = names
    db.commit()
    return _categories_out(db, user.business_id)


@router.post("/tags/bulk", response_model=s.CategoriesOut)
def bulk_tag(body: s.BulkTagIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Put many clients into a category (or take them out of one) at once, e.g. right after a bulk import."""
    add = _as_categories(db, user.business_id, [body.add]) if body.add else []
    if not add and not body.remove:
        raise HTTPException(422, "Choose a category.")
    for c in db.scalars(select(Customer).where(Customer.business_id == user.business_id, Customer.id.in_(body.customer_ids))):
        tags = list(c.tags or [])
        if body.remove:
            tags = [t for t in tags if t.lower() != body.remove.strip().lower()]
        c.tags = clean_tags(tags + add)
    db.commit()
    return _categories_out(db, user.business_id)


@router.put("/{customer_id}/tags", response_model=s.CustomerOut)
def set_tags(customer_id: int, body: s.TagsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_owned(db, Customer, customer_id, user.business_id, "Customer")
    c.tags = _as_categories(db, user.business_id, body.tags)
    db.commit()
    return c


@router.get("", response_model=list[s.CustomerSummary])
def list_customers(
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = Query(default=None, max_length=40),
    uncategorised: bool = Query(default=False),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Customer)
        .where(Customer.business_id == user.business_id)
        .options(
            selectinload(Customer.leads),
            selectinload(Customer.quotes).selectinload(Quote.items),
            selectinload(Customer.quotes).selectinload(Quote.service_records),
            selectinload(Customer.services),
        )
        .order_by(Customer.created_at.desc())
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.phone.ilike(like)))
    return [_summary(c) for c in db.scalars(stmt)
            if (not tag or has_tag(c, tag)) and (not uncategorised or not c.tags)]


@router.post("", response_model=s.CustomerOut, status_code=201)
def create_customer(body: s.CustomerIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = Customer(business_id=user.business_id, **body.model_dump())
    db.add(c)
    db.commit()
    return c


@router.patch("/{customer_id}", response_model=s.CustomerOut)
def update_customer(customer_id: int, body: s.CustomerIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_owned(db, Customer, customer_id, user.business_id, "Customer")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return c


# ---------------------------------------------------------------- bulk import
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def _existing_by_phone(db: Session, business_id: int) -> dict[str, str]:
    out = {}
    for name, phone in db.execute(
        select(Customer.name, Customer.phone).where(Customer.business_id == business_id, Customer.phone.is_not(None))
    ):
        p = clean_phone(phone)
        if p:
            out.setdefault(p, name)
    return out


def _preview(db: Session, business_id: int, rows: list[Row]) -> s.ImportPreviewOut:
    existing = _existing_by_phone(db, business_id)
    seen: set[str] = set()
    out = []
    for r in rows:
        if not r.phone:
            status, ex = "no_phone", None
        elif r.phone in existing:
            status, ex = "existing", existing[r.phone]
        elif r.phone in seen:
            status, ex = "duplicate", None
        else:
            status, ex = "new", None
        if r.phone:
            seen.add(r.phone)
        out.append(s.ImportPreviewRow(name=r.name, phone=r.phone, email=r.email, area=r.area, status=status, existing_name=ex))
    return s.ImportPreviewOut(rows=out, counts=dict(Counter(r.status for r in out)))


def _rows_from_in(items: list[s.ImportRowIn]) -> list[Row]:
    return finish_rows([Row(name=i.name, phone=clean_phone(i.phone), email=i.email, area=i.area) for i in items])


@router.post("/import/preview", response_model=s.ImportPreviewOut)
def import_preview(body: s.ImportPreviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.rows:
        rows = _rows_from_in(body.rows)
    elif body.text and body.text.strip():
        rows = parse_text(body.text)
    else:
        raise HTTPException(422, "Paste some contacts or choose them from your phone first.")
    if not rows:
        raise HTTPException(422, "We couldn't find any names or phone numbers in that.")
    return _preview(db, user.business_id, rows)


@router.post("/import/preview-file", response_model=s.ImportPreviewOut)
async def import_preview_file(
    file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)
):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That file is larger than 5 MB. Split it into smaller files and upload them one by one.")
    try:
        rows = parse_file(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:
        raise HTTPException(422, "We couldn't read that file. Upload a contacts file (.vcf), an Excel file (.xlsx) or a CSV.")
    if not rows:
        raise HTTPException(422, "We couldn't find any contacts in that file. Check it has a name and phone column.")
    return _preview(db, user.business_id, rows)


@router.post("/import", response_model=s.ImportResultOut)
def import_commit(body: s.ImportCommitIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Saves the rows the owner ticked. Numbers that already exist are skipped, never duplicated."""
    rows = _rows_from_in(body.rows)[:MAX_ROWS]
    cat = _as_categories(db, user.business_id, [body.category]) if body.category else []
    existing = set(_existing_by_phone(db, user.business_id))
    if cat:  # clients already saved with these numbers join the category too
        phones = {r.phone for r in rows if r.phone and r.phone in existing}
        for cu in db.scalars(select(Customer).where(Customer.business_id == user.business_id, Customer.phone.is_not(None))):
            if clean_phone(cu.phone) in phones:
                cu.tags = clean_tags(list(cu.tags or []) + cat)
    note = f"Imported {date.today():%d %b %Y}"
    created = 0
    for r in rows:
        if r.phone and r.phone in existing:
            continue
        if r.phone:
            existing.add(r.phone)
        db.add(Customer(business_id=user.business_id, name=r.name, phone=r.phone, email=r.email, area=r.area, notes=note, tags=list(cat)))
        created += 1
    record(db, user.business_id, "customers_imported", f"{created} customers")
    db.commit()
    return s.ImportResultOut(created=created, skipped=len(body.rows) - created)
