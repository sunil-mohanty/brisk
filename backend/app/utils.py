import calendar
import re
import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import quote as urlquote

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I, easy to read aloud


def new_token(length: int = 10) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class Totals:
    subtotal: Decimal
    discount: Decimal
    taxable: Decimal
    vat: Decimal
    total: Decimal


def quote_totals(items, discount, vat_rate) -> Totals:
    """VAT is charged on the amount after discount (UAE practice for trade discounts)."""
    subtotal = money(sum(Decimal(str(i.quantity)) * Decimal(str(i.unit_price)) for i in items))
    disc = min(money(discount), subtotal)
    taxable = subtotal - disc
    vat = money(taxable * Decimal(str(vat_rate)) / Decimal(100))
    return Totals(subtotal, disc, taxable, vat, taxable + vat)


def quote_label(number: int) -> str:
    return f"Q-{number}"


def valid_until(created_at: datetime, valid_days: int) -> date:
    return (created_at + timedelta(days=valid_days)).date()


def is_expired(created_at: datetime, valid_days: int, today: date | None = None) -> bool:
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return (today or datetime.now(timezone.utc).date()) > valid_until(created_at, valid_days)


def normalize_phone(raw: str | None, default_cc: str = "971") -> str | None:
    """Digits only, with country code. '050 123 4567' -> '971501234567'."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = default_cc + digits[1:]
    elif len(digits) <= 9:
        digits = default_cc + digits
    return digits


def whatsapp_link(phone: str | None, text: str = "") -> str | None:
    n = normalize_phone(phone)
    if not n:
        return None
    return f"https://wa.me/{n}" + (f"?text={urlquote(text)}" if text else "")


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))
