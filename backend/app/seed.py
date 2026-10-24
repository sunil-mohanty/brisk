"""Load a demo salon so every screen has something in it on first run.

    python -m app.seed            # creates demo@tressa.app / demo12345
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from .activity import UAE
from .db import SessionLocal
from .models import (
    Appointment,
    AppointmentStatus,
    Business,
    Campaign,
    CampaignItem,
    CatalogItem,
    InventoryItem,
    StockMove,
    Customer,
    Lead,
    LeadStatus,
    LinkClick,
    LinkItem,
    QRCode,
    QRDestination,
    Quote,
    QuoteItem,
    QuoteStatus,
    QuoteView,
    ServiceRecord,
    Stylist,
    User,
)
from .security import hash_password
from .utils import new_token

EMAIL, PASSWORD = "demo@tressa.app", "demo12345"

MENU = [
    # name, price, minutes, category, "from" price
    ("Women's cut & blow-dry", 180, 60, "Hair", False),
    ("Men's haircut", 70, 30, "Hair", False),
    ("Blow-dry & styling", 90, 45, "Hair", False),
    ("Root colour", 220, 90, "Colour", False),
    ("Balayage", 650, 180, "Colour", True),
    ("Keratin treatment", 700, 150, "Colour", True),
    ("Gel manicure", 90, 45, "Nails", False),
    ("Gel pedicure", 120, 60, "Nails", False),
    ("Classic facial", 250, 60, "Skin", False),
    ("Beard trim & shape", 50, 20, "Grooming", False),
    ("Threading – full face", 60, 20, "Grooming", False),
    ("Bridal hair & makeup", 1800, 180, "Bridal", True),
]
TEAM = [("Maya Haddad", "Senior stylist", "#b4532f"), ("Karim Nassar", "Barber", "#5e7a5a"), ("Joy Santos", "Nail artist", "#8a5a83")]


def main() -> None:
    db = SessionLocal()
    if db.scalar(select(User).where(User.email == EMAIL)):
        print(f"Demo account already exists: {EMAIL} / {PASSWORD}")
        return
    now = datetime.now(timezone.utc)
    today = datetime.now(UAE).date()
    ago = lambda d, h=10: (now - timedelta(days=d)).replace(hour=h, minute=0)  # noqa: E731

    def at(day: date, hh: int, mm: int = 0) -> datetime:
        return datetime.combine(day, time(hh, mm), tzinfo=UAE)

    biz = Business(
        name="Layla Beauty Lounge", phone="+971 50 123 4567", whatsapp="+971 50 123 4567", email="hello@laylabeauty.ae",
        tagline="Hair, nails & bridal · Al Barsha", address="Shop 4, Al Barsha 1, near Mall of the Emirates, Dubai",
        trn="100234567800003", next_quote_number=1014, business_type="unisex", slug="layla-beauty",
        bio="Unisex salon in Al Barsha. Colour, cuts, nails and bridal. Walk-ins welcome, booking recommended.",
        instagram="laylabeauty.dxb", tiktok="laylabeauty", hours="Daily 10am – 10pm · Fri from 2pm",
        maps_url="https://maps.google.com/?q=Al+Barsha+1+Dubai", link_theme="clay", link_motion="bloom", link_views=486,
        link_page_enabled=True, open_time="10:00", close_time="22:00", closed_days="",
    )
    db.add(biz)
    db.flush()
    db.add(User(business_id=biz.id, email=EMAIL, name="Layla", password_hash=hash_password(PASSWORD)))

    db.add_all([
        CatalogItem(business_id=biz.id, name=n, unit_price=Decimal(p), duration_min=m, category=c, price_from=f, uses=10 - i % 7)
        for i, (n, p, m, c, f) in enumerate(MENU)
    ])
    team = [Stylist(business_id=biz.id, name=n, role=r, color=c, position=i) for i, (n, r, c) in enumerate(TEAM)]
    db.add_all(team)
    db.add_all([
        LinkItem(business_id=biz.id, label="Bridal lookbook 2026", url="https://laylabeauty.ae/bridal", highlight=True, position=0, clicks=41),
        LinkItem(business_id=biz.id, label="Gift vouchers", url="https://laylabeauty.ae/gift", position=1, clicks=17),
    ])

    people = [
        ("Noor Saleh", "+971 50 441 2290", "Al Barsha"), ("Priya Nair", "+971 55 918 3301", "JLT"),
        ("Omar Haddad", "+971 52 600 7714", "Tecom"), ("Fatima Khan", "+971 56 230 8842", "Al Sufouh"),
        ("Rashid Saeed", "+971 50 772 1065", "Barsha Heights"), ("Grace Thomas", "+971 54 318 9920", "Dubai Marina"),
        ("Aisha Rahman", "+971 58 101 4473", "Arabian Ranches"), ("Leila Farouk", "+971 55 640 2218", "Al Quoz"),
        ("Sara Ali", "+971 50 909 1188", "Umm Suqeim"),
    ]
    cs = [Customer(business_id=biz.id, name=n, phone=p, area=a, created_at=ago(40)) for n, p, a in people]
    db.add_all(cs)

    qr_specs = [
        ("Reception counter", "Counter stand", QRDestination.landing, 64, 31), ("Instagram", "Bio link", QRDestination.whatsapp, 140, 72),
        ("Mirror sticker", "Rebook at the mirror", QRDestination.landing, 38, 12),
    ]
    qrs = {n: QRCode(business_id=biz.id, code=new_token(6), name=n, campaign=c, destination=d, scans=s, clicks=k) for n, c, d, s, k in qr_specs}
    db.add_all(qrs.values())
    db.flush()

    lead_specs = [
        # customer, source, service, note, status, days ago, preferred in days, time
        (0, "Instagram", "Balayage", "Wants a soft caramel balayage", LeadStatus.won, 6, None, None),
        (6, "Link page", "Bridal hair & makeup", "Wedding on the 14th, home visit please", LeadStatus.quoted, 5, 22, "Morning"),
        (5, "Reception counter", "Keratin treatment", None, LeadStatus.contacted, 2, None, None),
        (2, "Instagram", "Men's haircut, Beard trim & shape", None, LeadStatus.won, 3, None, None),
        (8, "Link page", "Gel manicure, Gel pedicure", "First visit", LeadStatus.new, 0, 2, "Evening"),
        (7, "Link page", "Classic facial", None, LeadStatus.new, 0, 1, "After 4pm"),
        (3, "Mirror sticker", "Root colour", None, LeadStatus.lost, 12, None, None),
    ]
    leads = []
    for ci, src, svc, note, st, d, pref, pt in lead_specs:
        leads.append(Lead(
            business_id=biz.id, customer_id=cs[ci].id, qr_id=qrs[src].id if src in qrs else None, source=src, requirement=note,
            service_interest=svc, preferred_date=today + timedelta(days=pref) if pref else None, preferred_time=pt,
            stylist_pref="Maya" if ci == 8 else None, status=st, created_at=ago(d),
        ))
    db.add_all(leads)
    db.flush()

    def quote(ci, li, items, disc, st, d, views=(), decided=None):
        q = Quote(
            business_id=biz.id, customer_id=cs[ci].id, lead_id=leads[li].id, number=biz.next_quote_number, token=new_token(10),
            discount=Decimal(disc), status=st, created_at=ago(d), decided_at=ago(decided, 15) if decided is not None else None,
            shared_at=ago(d), notes="50% deposit to confirm the date. Includes trial session.",
            booking_status=("confirmed" if li == 0 else "awaiting") if st == QuoteStatus.accepted else None,
            items=[QuoteItem(position=n, description=a, quantity=Decimal(b), unit_price=Decimal(c)) for n, (a, b, c) in enumerate(items)],
            views=[QuoteView(viewed_at=ago(vd, vh)) for vd, vh in views],
        )
        biz.next_quote_number += 1
        db.add(q)
        return q

    quote(6, 1, [("Bridal hair & makeup", 1, 1800), ("Bridal trial session", 1, 400), ("Home visit charge", 1, 150)], 150,
          QuoteStatus.viewed, 4, [(4, 20), (3, 9)])
    q_bal = quote(0, 0, [("Balayage (long hair)", 1, 650), ("Olaplex treatment", 1, 120)], 0, QuoteStatus.accepted, 6, [(6, 12)], 6)
    quote(3, 6, [("Root colour", 1, 220)], 0, QuoteStatus.rejected, 12, [(12, 11)], 11)
    db.flush()

    maya, karim, joy = team
    appts = [
        # day offset, hh, mm, customer, stylist, service, minutes, price, status, quote, lead
        (0, 10, 30, 1, maya, "Women's cut & blow-dry", 60, 180, AppointmentStatus.completed, None, None),
        (0, 12, 0, 0, maya, "Balayage + Olaplex", 180, 770, AppointmentStatus.arrived, q_bal, leads[0]),
        (0, 13, 0, 2, karim, "Men's haircut + beard", 45, 120, AppointmentStatus.confirmed, None, leads[3]),
        (0, 15, 30, 5, joy, "Gel manicure", 45, 90, AppointmentStatus.confirmed, None, None),
        (0, 17, 0, 4, karim, "Men's haircut", 30, 70, AppointmentStatus.booked, None, None),
        (0, 18, 30, 3, maya, "Blow-dry & styling", 45, 90, AppointmentStatus.booked, None, None),
        (1, 11, 0, 7, joy, "Gel pedicure", 60, 120, AppointmentStatus.confirmed, None, None),
        (1, 16, 0, 8, maya, "Root colour", 90, 220, AppointmentStatus.booked, None, None),
        (2, 14, 0, 6, maya, "Bridal trial session", 120, 400, AppointmentStatus.booked, None, None),
        (-3, 19, 0, 5, karim, "Men's haircut", 30, 70, AppointmentStatus.no_show, None, None),
    ]
    for off, hh, mm, ci, who, svc, mins, price, st, q, lead in appts:
        a = Appointment(
            business_id=biz.id, customer_id=cs[ci].id, stylist_id=who.id, token=new_token(10), service=svc,
            starts_at=at(today + timedelta(days=off), hh, mm), duration_min=mins, price=Decimal(price), status=st,
            quote_id=q.id if q else None, lead_id=lead.id if lead else None,
            confirmed_at=now if st in (AppointmentStatus.confirmed, AppointmentStatus.arrived, AppointmentStatus.completed) else None,
        )
        db.add(a)
        if st == AppointmentStatus.completed:
            db.flush()
            r = ServiceRecord(
                business_id=biz.id, customer_id=cs[ci].id, token=new_token(8), service=svc, service_date=today, amount=Decimal(price),
                technician=who.name, notes="Long layers, face-framing. Uses sulphate-free shampoo.", next_service_date=today + timedelta(weeks=6),
            )
            db.add(r)
            db.flush()
            a.service_record_id = r.id

    # Past visits, some due to rebook
    for ci, svc, days_ago, amt, who, weeks in [
        (3, "Root colour", 38, 220, "Maya Haddad", 6), (4, "Men's haircut", 30, 70, "Karim Nassar", 4),
        (1, "Gel manicure", 25, 90, "Joy Santos", 3), (2, "Men's haircut", 33, 70, "Karim Nassar", 4),
        (7, "Classic facial", 70, 250, "Maya Haddad", 8),
    ]:
        d = today - timedelta(days=days_ago)
        db.add(ServiceRecord(
            business_id=biz.id, customer_id=cs[ci].id, token=new_token(8), service=svc, service_date=d, amount=Decimal(amt),
            technician=who, next_service_date=d + timedelta(weeks=weeks),
        ))

    db.add(Campaign(
        business_id=biz.id, token=new_token(8), title="Bridal glow package", description="Bridal hair & makeup on the day, plus a trial session the week before.",
        discount=Decimal(300), valid_until=today + timedelta(days=30), duration_min=180, views=312,
        notes="50% deposit confirms your date.",
        items=[CampaignItem(position=0, description="Bridal hair & makeup", unit_price=Decimal(1800)),
               CampaignItem(position=1, description="Bridal trial session", unit_price=Decimal(400))],
    ))
    for name, cat, unit, stock, low, cost, sell, sup in [
        ("Developer 20 vol 1L", "Colour", "bottle", 6, 2, 28, None, "Gulf Beauty Supplies"),
        ("Permanent colour 7.1", "Colour", "tube", 3, 4, 22, None, "Gulf Beauty Supplies"),
        ("Olaplex No.3", "Retail", "bottle", 9, 3, 85, 140, "Olaplex distributor"),
        ("Sulphate-free shampoo 300ml", "Retail", "bottle", 14, 4, 32, 65, "Gulf Beauty Supplies"),
        ("Gel polish base coat", "Nails", "bottle", 2, 2, 35, None, "Nail Pro Trading"),
        ("Nitrile gloves (box 100)", "Consumables", "box", 5, 2, 18, None, "Medline UAE"),
    ]:
        item = InventoryItem(business_id=biz.id, name=name, category=cat, unit=unit, stock=Decimal(stock), low_stock=Decimal(low),
                             cost_price=Decimal(cost), sell_price=Decimal(sell) if sell else None, supplier=sup)
        db.add(item)
        db.flush()
        db.add(StockMove(business_id=biz.id, item_id=item.id, change=Decimal(stock), reason="received", note="Opening stock"))

    # A week of link page activity
    for d in range(7):
        for kind, n in (("view", 18 + d * 3), ("whatsapp", 4 + d % 3), ("instagram", 3), ("book", d % 2), ("link", 2)):
            db.add_all([LinkClick(business_id=biz.id, kind=kind, created_at=ago(d, 9 + i % 12)) for i in range(n)])
    db.commit()
    print(f"Demo data loaded. Sign in with {EMAIL} / {PASSWORD}. Link page: /layla-beauty")


if __name__ == "__main__":
    main()
