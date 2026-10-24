"""Load a demo salon so every screen has something in it on first run.

    python -m app.seed            # demo@tressa.app / demo12345 (salon), broker@tressa.app / demo12345 (real estate)
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


BROKER = "broker@tressa.app"
LISTINGS = [
    # name, price, viewing minutes, category, "from" price
    ("Viewing – 2BR, Marina Gate (sale)", 2450000, 45, "For sale", False),
    ("Viewing – 1BR, JLT Cluster D (rent / year)", 85000, 30, "For rent", False),
    ("Viewing – 4BR villa, Arabian Ranches (sale)", 6900000, 60, "For sale", True),
    ("Viewing – Studio, Business Bay (rent / year)", 62000, 30, "For rent", False),
    ("Property valuation visit", 750, 60, "Services", False),
    ("Tenancy contract & Ejari", 1200, 30, "Services", False),
]


def seed_real_estate(db) -> None:
    """A small brokerage, so the real estate theme and words can be tried."""
    if db.scalar(select(User).where(User.email == BROKER)):
        return
    now = datetime.now(timezone.utc)
    today = datetime.now(UAE).date()
    ago = lambda d, h=10: (now - timedelta(days=d)).replace(hour=h, minute=0)  # noqa: E731

    def at(day: date, hh: int, mm: int = 0) -> datetime:
        return datetime.combine(day, time(hh, mm), tzinfo=UAE)

    biz = Business(
        name="Marina Key Properties", phone="+971 4 555 0192", whatsapp="+971 50 700 1122", email="hello@marinakey.ae",
        tagline="Sales & leasing · Dubai Marina, JLT, Ranches", address="Office 1204, Marina Plaza, Dubai Marina",
        trn="100877665400003", next_quote_number=2201, business_type="real_estate", slug="marina-key",
        bio="RERA-registered brokerage. Apartments and villas for sale and rent across Dubai Marina, JLT and the Ranches.",
        instagram="marinakey.dxb", hours="Daily 9am – 8pm", maps_url="https://maps.google.com/?q=Marina+Plaza+Dubai",
        link_theme="navy", link_motion="calm", link_views=231, link_page_enabled=True,
        open_time="09:00", close_time="20:00", closed_days="", default_vat_rate=Decimal("5.00"),
    )
    db.add(biz)
    db.flush()
    db.add(User(business_id=biz.id, email=BROKER, name="Omar", password_hash=hash_password(PASSWORD)))
    db.add_all([CatalogItem(business_id=biz.id, name=n, unit_price=Decimal(p), duration_min=m, category=c, price_from=f, uses=6 - i % 4)
                for i, (n, p, m, c, f) in enumerate(LISTINGS)])
    team = [Stylist(business_id=biz.id, name=n, role=r, color=c, position=i) for i, (n, r, c) in enumerate(
        [("Omar Siddiqui", "Senior agent", "#1f3a5f"), ("Hannah Brooks", "Leasing agent", "#4a6b8a"), ("Ravi Menon", "Sales agent", "#5b5f97")])]
    db.add_all(team)
    people = [("Daniel Weber", "+971 50 118 2290", "Dubai Marina"), ("Ananya Iyer", "+971 55 304 7712", "JLT"),
              ("Khalid Al Mansoori", "+971 52 990 1431", "Arabian Ranches"), ("Sophie Martin", "+971 56 771 2045", "Business Bay"),
              ("Yusuf Rahman", "+971 54 220 9918", "JVC")]
    cs = [Customer(business_id=biz.id, name=n, phone=p, area=a, created_at=ago(20)) for n, p, a in people]
    db.add_all(cs)
    db.flush()
    leads = [Lead(business_id=biz.id, customer_id=cs[ci].id, source=src, service_interest=svc, requirement=req, status=st,
                  preferred_date=today + timedelta(days=pref) if pref else None, preferred_time=pt, created_at=ago(d))
             for ci, src, svc, req, st, d, pref, pt in [
                 (0, "Instagram", "2BR for sale, Dubai Marina", "Budget AED 2.5M, sea view, ready to move", LeadStatus.quoted, 4, None, None),
                 (1, "Link page", "1BR for rent, JLT", "Moving in December, 1 cheque possible", LeadStatus.new, 0, 2, "Evening"),
                 (2, "Property Finder", "Villa valuation", "Thinking of selling the 4BR", LeadStatus.won, 9, None, None),
                 (3, "Link page", "Studio, Business Bay", None, LeadStatus.new, 1, 1, "Morning"),
             ]]
    db.add_all(leads)
    db.flush()
    q = Quote(business_id=biz.id, customer_id=cs[1].id, lead_id=leads[1].id, number=biz.next_quote_number, token=new_token(10),
              status=QuoteStatus.viewed, created_at=ago(1), shared_at=ago(1), vat_rate=Decimal("5.00"),
              notes="Agency fee 5% of annual rent + VAT. 4 cheques accepted.", reference="1BR JLT Cluster D, unit 1408",
              items=[QuoteItem(position=0, description="Annual rent – 1BR, JLT Cluster D", quantity=Decimal(1), unit_price=Decimal(85000)),
                     QuoteItem(position=1, description="Agency fee (5%)", quantity=Decimal(1), unit_price=Decimal(4250))],
              views=[QuoteView(viewed_at=ago(1, 19))])
    biz.next_quote_number += 1
    db.add(q)
    omar, hannah, ravi = team
    for off, hh, mm, ci, who, svc, mins, st in [
        (0, 11, 0, 0, omar, "Viewing – 2BR, Marina Gate", 45, AppointmentStatus.confirmed),
        (0, 17, 30, 1, hannah, "Viewing – 1BR, JLT Cluster D", 30, AppointmentStatus.booked),
        (1, 10, 0, 2, ravi, "Valuation visit – 4BR villa, Arabian Ranches", 60, AppointmentStatus.confirmed),
        (2, 16, 0, 3, hannah, "Viewing – Studio, Business Bay", 30, AppointmentStatus.booked),
    ]:
        db.add(Appointment(business_id=biz.id, customer_id=cs[ci].id, stylist_id=who.id, token=new_token(10), service=svc,
                           starts_at=at(today + timedelta(days=off), hh, mm), duration_min=mins, price=Decimal(0), status=st,
                           confirmed_at=now if st == AppointmentStatus.confirmed else None))
    db.add(ServiceRecord(business_id=biz.id, customer_id=cs[4].id, token=new_token(8), service="Leased – 1BR, JVC (annual)",
                         service_date=today - timedelta(days=12), amount=Decimal(3900), technician="Hannah Brooks",
                         notes="Tenancy starts 1 Nov. Renewal reminder set.", next_service_date=today + timedelta(weeks=44)))
    db.add(Campaign(
        business_id=biz.id, token=new_token(8), title="Sea-view 2BR at Marina Gate", vat_rate=Decimal(0),
        description="High floor, full sea view, 1,380 sq ft, vacant on transfer.", valid_until=today + timedelta(days=21),
        duration_min=45, views=184, notes="Viewings daily 9am – 8pm. Bring Emirates ID or passport.",
        items=[CampaignItem(position=0, description="2-bed apartment, Marina Gate 1", unit_price=Decimal(2450000)),
               CampaignItem(position=1, description="Covered parking space", unit_price=Decimal(0))],
    ))
    db.commit()
    print(f"Real estate demo loaded. Sign in with {BROKER} / {PASSWORD}. Link page: /marina-key")


if __name__ == "__main__":
    main()
    with SessionLocal() as _db:
        seed_real_estate(_db)
