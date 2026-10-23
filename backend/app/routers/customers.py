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
from ..models import Customer, Quote, QuoteStatus, User
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


@router.get("", response_model=list[s.CustomerSummary])
def list_customers(
    q: str | None = Query(default=None, max_length=100),
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
    return [_summary(c) for c in db.scalars(stmt)]


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
    existing = set(_existing_by_phone(db, user.business_id))
    note = f"Imported {date.today():%d %b %Y}"
    created = 0
    for r in rows:
        if r.phone and r.phone in existing:
            continue
        if r.phone:
            existing.add(r.phone)
        db.add(Customer(business_id=user.business_id, name=r.name, phone=r.phone, email=r.email, area=r.area, notes=note))
        created += 1
    record(db, user.business_id, "customers_imported", f"{created} customers")
    db.commit()
    return s.ImportResultOut(created=created, skipped=len(body.rows) - created)
