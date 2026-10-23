from datetime import date
from decimal import Decimal

from app.utils import add_months, normalize_phone, quote_totals

from .conftest import signup


class Item:
    def __init__(self, q, p):
        self.quantity, self.unit_price = Decimal(q), Decimal(p)


def test_totals_match_spec_example():
    # 2 x AED 250, AED 20 discount, 5% VAT -> 480 + 24 = 504
    t = quote_totals([Item("2", "250")], Decimal("20"), Decimal("5"))
    assert (t.subtotal, t.discount, t.vat, t.total) == (Decimal("500.00"), Decimal("20.00"), Decimal("24.00"), Decimal("504.00"))


def test_phone_and_months():
    assert normalize_phone("050 123 4567") == "971501234567"
    assert normalize_phone("+971 50 123 4567") == "971501234567"
    assert normalize_phone("00971501234567") == "971501234567"
    assert add_months(date(2026, 8, 31), 6) == date(2027, 2, 28)


def test_full_lifecycle(client):
    h = signup(client)

    # Acquire: create a QR, scan it, send an enquiry from the landing page
    qr = client.post("/api/qr", json={"name": "Flyer", "campaign": "Al Nahda drop", "destination": "landing"}, headers=h).json()
    assert qr["target_url"] == f"https://app.test/r/{qr['code']}"
    r = client.get(f"/api/public/r/{qr['code']}")
    assert r.json()["url"] == f"https://app.test/l/{qr['code']}"
    land = client.get(f"/api/public/l/{qr['code']}").json()
    assert land["business"]["name"] == "Layla Beauty Lounge" and land["business"]["initials"] == "LB"
    wa = client.post(f"/api/public/l/{qr['code']}/click", json={"kind": "whatsapp"}).json()
    assert wa["url"].startswith("https://wa.me/971501234567")
    assert client.post(f"/api/public/l/{qr['code']}/enquiry", json={"name": "Ahmed", "phone": "+971 50 441 2290", "requirement": "2 ACs"}).status_code == 201

    leads = client.get("/api/leads", headers=h).json()
    assert len(leads) == 1 and leads[0]["source"] == "Flyer" and leads[0]["status"] == "new"
    lead = leads[0]
    qrs = client.get("/api/qr", headers=h).json()
    assert qrs[0]["scans"] == 1 and qrs[0]["clicks"] == 2 and qrs[0]["leads"] == 1

    # Quote
    body = {"lead_id": lead["id"], "items": [{"description": "AC Maintenance", "quantity": 2, "unit_price": 250}], "discount": 20}
    q = client.post("/api/quotes", json=body, headers=h).json()
    assert q["label"] == "Q-1001" and q["totals"]["total"] == "504.00" and q["status"] == "sent"
    assert q["public_url"] == f"https://app.test/q/{q['token']}"
    assert client.get("/api/leads", headers=h).json()[0]["status"] == "quoted"

    # Owner preview doesn't count; customer view does, and repeats are de-duplicated
    client.get(f"/api/public/q/{q['token']}?preview=1")
    assert client.get(f"/api/quotes/{q['id']}", headers=h).json()["view_count"] == 0
    pub = client.get(f"/api/public/q/{q['token']}").json()
    client.get(f"/api/public/q/{q['token']}")
    detail = client.get(f"/api/quotes/{q['id']}", headers=h).json()
    assert detail["view_count"] == 1 and detail["status"] == "viewed"
    assert pub["customer_name"] == "Ahmed" and pub["totals"]["vat"] == "24.00"

    # PDF renders
    pdf = client.get(f"/api/public/q/{q['token']}/pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    # Service record can't be made before acceptance
    svc_body = {"quote_id": q["id"], "service": "AC Maintenance", "service_date": "2026-10-03", "amount": 504, "technician": "John", "next_service_months": 6}
    assert client.post("/api/services", json=svc_body, headers=h).status_code == 409

    # Customer accepts
    acc = client.post(f"/api/public/q/{q['token']}/accept").json()
    assert acc["status"] == "accepted"
    assert client.post(f"/api/public/q/{q['token']}/reject").status_code == 409
    assert client.get("/api/leads", headers=h).json()[0]["status"] == "won"

    # Serve -> Retain
    svc = client.post("/api/services", json=svc_body, headers=h).json()
    assert svc["next_service_date"] == "2027-04-03" and svc["customer"]["name"] == "Ahmed"
    card = client.get(f"/api/public/s/{svc['token']}").json()
    assert card["history"][0]["service"] == "AC Maintenance" and card["next_service_date"] == "2027-04-03"
    rem = client.post(f"/api/services/{svc['id']}/reminder", headers=h).json()
    assert rem["whatsapp_url"].startswith("https://wa.me/971504412290")

    # Customer database ties it together
    cust = client.get("/api/customers", headers=h).json()
    assert cust[0]["stage"] == "Retain" and cust[0]["first_source"] == "Flyer" and cust[0]["lifetime_value"] == "504.00"

    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["leads"] == 1 and dash["won_value"] == "504.00" and dash["acceptance_rate"] == 100
    assert dash["sources"] == [{"source": "Flyer", "leads": 1}]


def test_enquiry_reuses_customer_by_phone(client):
    h = signup(client)
    qr = client.post("/api/qr", json={"name": "Instagram"}, headers=h).json()
    client.post(f"/api/public/l/{qr['code']}/enquiry", json={"name": "Priya", "phone": "055 918 3301"})
    client.post(f"/api/public/l/{qr['code']}/enquiry", json={"name": "Priya N", "phone": "+971559183301"})
    assert len(client.get("/api/customers", headers=h).json()) == 1
    assert len(client.get("/api/leads", headers=h).json()) == 2


def test_tenants_are_isolated(client):
    a = signup(client, "a@a.ae", "Alpha Cleaning")
    b = signup(client, "b@b.ae", "Beta Pest Control")
    q = client.post(
        "/api/quotes",
        json={"new_customer": {"name": "Omar", "phone": "052 600 7714"}, "items": [{"description": "Deep clean", "unit_price": 300}]},
        headers=a,
    ).json()
    assert client.get(f"/api/quotes/{q['id']}", headers=b).status_code == 404
    assert client.get("/api/customers", headers=b).json() == []
    # Quote numbers are per business
    q2 = client.post(
        "/api/quotes", json={"new_customer": {"name": "Lina"}, "items": [{"description": "Spray", "unit_price": 150}]}, headers=b
    ).json()
    assert q2["label"] == "Q-1001"


def test_whatsapp_qr_redirects_straight_to_chat(client):
    h = signup(client)
    qr = client.post("/api/qr", json={"name": "Vehicle", "destination": "whatsapp"}, headers=h).json()
    url = client.get(f"/api/public/r/{qr['code']}").json()["url"]
    assert url.startswith("https://wa.me/971501234567?text=")
    img = client.get(f"/api/qr/{qr['id']}/image", headers=h)
    assert img.status_code == 200 and img.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_auth_errors(client):
    signup(client)
    assert client.post("/api/auth/login", json={"email": "owner@layla.ae", "password": "wrong-pass"}).status_code == 401
    assert client.get("/api/leads").status_code == 401
    assert client.post(
        "/api/auth/signup", json={"business_name": "X Co", "name": "X", "email": "OWNER@layla.ae", "password": "supersecret"}
    ).status_code == 409


def test_invite_code_and_railway_url(client, monkeypatch):
    from app.config import Settings, get_settings

    assert Settings(database_url="postgresql://u:p@h:5432/d").database_url == "postgresql+psycopg://u:p@h:5432/d"
    assert Settings(database_url="postgres://u:p@h/d").database_url == "postgresql+psycopg://u:p@h/d"
    monkeypatch.setattr(get_settings(), "signup_code", "WELCOME26")
    monkeypatch.setattr(get_settings(), "open_signup", False)
    body = {"business_name": "Gamma Pest", "name": "G", "email": "g@g.ae", "password": "supersecret"}
    assert client.post("/api/auth/signup", json=body).status_code == 403  # closed: code required
    assert client.post("/api/auth/signup", json={**body, "invite_code": "nope"}).status_code == 403
    assert client.post("/api/auth/signup", json={**body, "invite_code": " WELCOME26 "}).status_code == 201
    # Open sign-up (the default): no code needed, but a wrong code is still refused
    monkeypatch.setattr(get_settings(), "open_signup", True)
    body2 = {**body, "email": "h@g.ae"}
    assert client.post("/api/auth/signup", json={**body2, "invite_code": "nope"}).status_code == 403
    assert client.post("/api/auth/signup", json=body2).status_code == 201


def test_self_serve_signup_trial_source_and_type(client, monkeypatch):
    from app.activity import uae_today
    from app.config import get_settings
    from datetime import timedelta

    monkeypatch.setattr(get_settings(), "admin_emails", "boss@tressa.app")
    body = {"business_name": "Saanvika Bakery", "name": "S", "email": "s@bake.ae", "password": "supersecret",
            "business_type": "NAILS", "source": "Instagram", "campaign": "oct-cakes"}
    r = client.post("/api/auth/signup", json=body)
    assert r.status_code == 201, r.text
    biz = r.json()["business"]
    assert biz["business_type"] == "nails"
    assert biz["trial_ends_at"] == str(uae_today() + timedelta(days=14))
    # unknown types fall back to "other"
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.patch("/api/business", json={"business_type": "spaceship"}, headers=h).json()["business_type"] == "unisex"
    assert client.patch("/api/business", json={"checklist_hidden": True}, headers=h).json()["checklist_hidden"] is True
    # admin sees where the sign-up came from
    boss = client.post("/api/auth/signup", json={"business_name": "HQ", "name": "B", "email": "boss@tressa.app", "password": "supersecret"}).json()
    rows = client.get("/api/admin/smes", headers={"Authorization": f"Bearer {boss['token']}"}).json()
    row = next(x for x in rows if x["name"] == "Saanvika Bakery")
    assert row["came_from"] == "instagram · oct-cakes" and row["plan"] == "Starter"


def test_signup_rate_limit(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "signups_per_ip_per_hour", 2)
    for i in range(2):
        assert client.post("/api/auth/signup", json={"business_name": f"Biz {i}", "name": "N", "email": f"n{i}@x.ae", "password": "supersecret"}).status_code == 201
    assert client.post("/api/auth/signup", json={"business_name": "Biz 9", "name": "N", "email": "n9@x.ae", "password": "supersecret"}).status_code == 429


def test_ready_to_send_and_customer_value(client):
    h = signup(client)
    q = client.post("/api/quotes", json={"new_customer": {"name": "Mingu", "phone": "0501234567"},
                                          "items": [{"description": "Cake", "quantity": 2, "unit_price": 70}], "vat_rate": 5}, headers=h).json()
    assert q["shared_at"] is None  # just created: "Ready to send"
    q2 = client.post(f"/api/quotes/{q['id']}/shared", headers=h).json()
    assert q2["shared_at"] is not None
    assert client.post(f"/api/quotes/{q['id']}/shared", headers=h).json()["shared_at"] == q2["shared_at"]  # first time kept
    # an accepted quote counts towards the customer's value (147 = 140 + 5% VAT)
    client.post(f"/api/quotes/{q['id']}/decision?accepted=true", headers=h)
    cust = next(c for c in client.get("/api/customers", headers=h).json() if c["name"] == "Mingu")
    assert cust["lifetime_value"] == "147.00"
    # once a service record is made from it, the value is not counted twice
    client.post("/api/services", json={"customer_id": cust["id"], "quote_id": q["id"], "service": "Cake delivered",
                                        "service_date": "2026-10-17", "amount": 147}, headers=h)
    cust = next(c for c in client.get("/api/customers", headers=h).json() if c["name"] == "Mingu")
    assert cust["lifetime_value"] == "147.00"
    # a customer opening the link also counts as sent
    q3 = client.post("/api/quotes", json={"customer_id": cust["id"], "items": [{"description": "Cookies", "unit_price": 20}]}, headers=h).json()
    client.get(f"/api/public/q/{q3['token']}")
    assert client.get(f"/api/quotes/{q3['id']}", headers=h).json()["shared_at"] is not None


def test_password_reset(client, monkeypatch):
    from app.routers import auth as auth_router

    sent = []
    monkeypatch.setattr(auth_router, "send_email", lambda to, subject, html, text: sent.append((to, text)) or True)
    auth_router._last_reset_request.clear()
    old = signup(client)

    # Unknown email: same answer, nothing sent
    r = client.post("/api/auth/forgot-password", json={"email": "nobody@nowhere.ae"})
    assert r.status_code == 200 and sent == []

    # Known email (any case): one email with a link to /reset-password
    r = client.post("/api/auth/forgot-password", json={"email": "OWNER@layla.ae"})
    assert r.status_code == 200 and len(sent) == 1 and sent[0][0] == "owner@layla.ae"
    link = next(w for w in sent[0][1].split() if "/reset-password?token=" in w)
    assert link.startswith("https://app.test/reset-password?token=")
    token = link.split("token=")[1]

    # Cooldown: a second request straight away sends nothing
    client.post("/api/auth/forgot-password", json={"email": "owner@layla.ae"})
    assert len(sent) == 1

    # A reset token can't be used as a session
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    # Weak password rejected
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422

    # Reset works and signs the user in
    r = client.post("/api/auth/reset-password", json={"token": token, "password": "brand-new-pass"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "owner@layla.ae"
    assert client.get("/api/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200

    # Link works only once; old password and old sessions stop working
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "another-pass1"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "owner@layla.ae", "password": "supersecret"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "owner@layla.ae", "password": "brand-new-pass"}).status_code == 200
    assert client.get("/api/me", headers=old).status_code == 401

    # Garbage and expired tokens
    assert client.post("/api/auth/reset-password", json={"token": "not-a-real-token", "password": "whatever1"}).status_code == 400
    from datetime import datetime, timedelta, timezone

    import jwt as pyjwt

    from app.config import get_settings
    expired = pyjwt.encode(
        {"sub": "1", "purpose": "password-reset", "pv": "x", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        get_settings().jwt_secret, algorithm="HS256",
    )
    r = client.post("/api/auth/reset-password", json={"token": expired, "password": "whatever1"})
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_reset_email_falls_back_to_log(caplog):
    from app.email import password_reset_email, send_email

    subject, html, text = password_reset_email("<b>Sunil</b> M", "https://app.test/reset-password?token=abc", 60)
    assert "<b>Sunil" not in html and "&lt;b&gt;Sunil" in html
    with caplog.at_level("WARNING", logger="salon.email"):
        assert send_email("a@b.ae", subject, html, text) is False
    assert "reset-password?token=abc" in caplog.text


def test_first_time_tips_are_remembered(client):
    h = signup(client)
    assert client.get("/api/me", headers=h).json()["user"]["seen_tips"] == []
    assert client.post("/api/me/tips", json={"seen": ["dash.new", "dash.new", "bad id!<>"]}, headers=h).json() == ["dash.new", "badid"]
    assert client.get("/api/me", headers=h).json()["user"]["seen_tips"] == ["dash.new", "badid"]
    assert client.post("/api/me/tips", json={"reset": True}, headers=h).json() == []


def test_tips_switch_and_price_list_and_job_details(client):
    h = signup(client)
    assert client.post("/api/me/tips", json={"enabled": False}, headers=h).json() == ["all-off"]
    assert client.post("/api/me/tips", json={"enabled": True}, headers=h).json() == []
    # price list: add, duplicate name updates price, most-used first
    items = client.post("/api/catalog", json=[{"name": "Split AC service (per unit)", "unit_price": 150}, {"name": "Gas top-up", "unit_price": 250}], headers=h).json()
    assert len(items) == 2
    items = client.post("/api/catalog", json=[{"name": "gas top-up", "unit_price": 275}], headers=h).json()
    assert len(items) == 2 and next(i for i in items if i["name"] == "Gas top-up")["unit_price"] == "275.00"
    client.post("/api/catalog/used", json=["Gas top-up"], headers=h)
    assert client.get("/api/catalog", headers=h).json()[0]["name"] == "Gas top-up"
    cid = items[0]["id"]
    assert client.patch(f"/api/catalog/{cid}", json={"unit_price": 99}, headers=h).json()["unit_price"] == "99.00"
    assert client.delete(f"/api/catalog/{cid}", headers=h).status_code == 204
    # job details carry from quote to the record and the customer pages
    q = client.post("/api/quotes", json={"new_customer": {"name": "Omar", "phone": "0509990000"}, "reference": " Toyota Camry · Dubai A 12345 ",
                                          "items": [{"description": "Brake pads", "unit_price": 300}]}, headers=h).json()
    assert q["reference"] == "Toyota Camry · Dubai A 12345"
    assert client.get(f"/api/public/q/{q['token']}?preview=1").json()["reference"] == "Toyota Camry · Dubai A 12345"
    client.post(f"/api/quotes/{q['id']}/decision?accepted=true", headers=h)
    r = client.post("/api/services", json={"quote_id": q["id"], "service": "Brake pads replaced", "service_date": "2026-10-18", "amount": 315}, headers=h).json()
    assert r["reference"] == "Toyota Camry · Dubai A 12345"
    assert client.get(f"/api/public/s/{r['public_url'].rsplit('/', 1)[1]}").json()["reference"] == "Toyota Camry · Dubai A 12345"
    # garage is a business type
    assert client.patch("/api/business", json={"business_type": "gents"}, headers=h).json()["business_type"] == "gents"
