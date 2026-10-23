from datetime import date, timedelta

from app.activity import uae_today
from app.config import get_settings
from app.db import SessionLocal
from app.models import ActivityDay

from .conftest import signup


def boss(client):
    return signup(client, "boss@tressa.app", "Platform HQ")


def test_admin_is_hidden_from_smes(client):
    sme = signup(client)
    assert client.get("/api/admin/overview", headers=sme).status_code == 404
    assert client.get("/api/admin/smes", headers=sme).status_code == 404
    assert client.get("/api/me", headers=sme).json()["user"]["is_admin"] is False
    assert client.get("/api/me", headers=boss(client)).json()["user"]["is_admin"] is True


def test_invite_code_per_sme(client, monkeypatch):
    b = boss(client)
    monkeypatch.setattr(get_settings(), "open_signup", False)
    inv = client.post("/api/admin/invites", json={"label": "Shreeu's Cafe", "trial_days": 30, "plan": "Starter", "plan_amount": 49}, headers=b).json()
    assert inv["code"].startswith("SAL-") and inv["signup_link"].endswith(f"/signup?code={inv['code']}")

    body = {"business_name": "Shreeu's Cafe", "name": "Owner", "email": "cafe@x.ae", "password": "password123"}
    assert client.post("/api/auth/signup", json=body).status_code == 403  # no code
    assert client.post("/api/auth/signup", json={**body, "invite_code": "SAL-NOPE-NOPE"}).status_code == 403
    r = client.post("/api/auth/signup", json={**body, "invite_code": inv["code"].lower()})  # case-insensitive
    assert r.status_code == 201
    again = client.post("/api/auth/signup", json={**body, "email": "other@x.ae", "invite_code": inv["code"]})
    assert again.status_code == 403 and "already been used" in again.json()["detail"]

    invites = client.get("/api/admin/invites", headers=b).json()
    assert invites[0]["used_by_name"] == "Shreeu's Cafe" and invites[0]["used_at"]
    row = next(x for x in client.get("/api/admin/smes", headers=b).json() if x["name"] == "Shreeu's Cafe")
    assert row["invite_label"] == "Shreeu's Cafe" and row["plan"] == "Starter" and row["plan_amount"] == "49.00"
    assert row["payment_state"] == "trial" and row["trial_ends_at"] == str(uae_today() + timedelta(days=30))

    inv2 = client.post("/api/admin/invites", json={"label": "Revoked one"}, headers=b).json()
    client.post(f"/api/admin/invites/{inv2['id']}/revoke", headers=b)
    r = client.post("/api/auth/signup", json={**body, "email": "z@x.ae", "invite_code": inv2["code"]})
    assert r.status_code == 403 and "switched off" in r.json()["detail"]


def test_days_used_and_health(client):
    b = boss(client)
    sme = signup(client)
    client.get("/api/dashboard", headers=sme)
    client.get("/api/leads", headers=sme)  # same day: still one day
    row = next(x for x in client.get("/api/admin/smes", headers=b).json() if x["owner_email"] == "owner@layla.ae")
    assert row["days_used"] == 1 and row["days_since_signup"] == 1 and row["health"] == "new"

    # Pretend they also used it on 4 earlier days and has started (made a QR)
    db = SessionLocal()
    for n in (1, 2, 5, 40):
        db.add(ActivityDay(business_id=row["id"], day=uae_today() - timedelta(days=n)))
    db.commit()
    db.close()
    client.post("/api/qr", json={"name": "Flyer"}, headers=sme)
    row = next(x for x in client.get("/api/admin/smes", headers=b).json() if x["id"] == row["id"])
    assert row["days_used"] == 5 and row["days_used_30"] == 4 and row["health"] == "active"

    detail = client.get(f"/api/admin/smes/{row['id']}", headers=b).json()
    assert len(detail["active_days"]) == 5
    kinds = [e["kind"] for e in detail["events"]]
    assert "signup" in kinds and "qr_created" in kinds
    steps = {s["key"]: s["done"] for s in detail["steps"]}
    assert steps["signed_up"] and steps["qr"] and not steps["quote"]


def test_billing_and_pause(client):
    b = boss(client)
    sme = signup(client)
    sid = next(x["id"] for x in client.get("/api/admin/smes", headers=b).json() if x["owner_email"] == "owner@layla.ae")

    d = client.patch(f"/api/admin/smes/{sid}", json={"plan": "Starter", "plan_amount": 49, "trial_ends_at": str(uae_today() - timedelta(days=1))}, headers=b).json()
    assert d["payment_state"] == "trial_ended"
    ov = client.get("/api/admin/overview", headers=b).json()
    assert any(a["kind"] == "trial_ended" for a in ov["attention"])

    d = client.post(f"/api/admin/smes/{sid}/payments", json={"amount": 147, "months": 3, "method": "Bank transfer"}, headers=b).json()
    assert d["payment_state"] == "paid" and len(d["payments"]) == 1
    paid_until = date.fromisoformat(d["paid_until"])
    assert paid_until > uae_today() + timedelta(days=85)
    ov = client.get("/api/admin/overview", headers=b).json()
    assert ov["paying"] == 1 and ov["mrr"] == "49.00"

    # A second payment extends from the current paid-until date, not from today
    d2 = client.post(f"/api/admin/smes/{sid}/payments", json={"amount": 49, "months": 1}, headers=b).json()
    assert date.fromisoformat(d2["paid_until"]) > paid_until
    d3 = client.delete(f"/api/admin/smes/{sid}/payments/{d2['payments'][0]['id']}", headers=b).json()
    assert d3["paid_until"] == str(paid_until)

    # Pause: the SME is locked out, public pages keep working, admin can switch them back on
    client.patch(f"/api/admin/smes/{sid}", json={"status": "suspended"}, headers=b)
    r = client.get("/api/dashboard", headers=sme)
    assert r.status_code == 403 and "paused" in r.json()["detail"]
    assert client.post("/api/auth/login", json={"email": "owner@layla.ae", "password": "supersecret"}).status_code == 403
    client.patch(f"/api/admin/smes/{sid}", json={"status": "active"}, headers=b)
    assert client.get("/api/dashboard", headers=sme).status_code == 200

    # Can't pause yourself
    me = next(x["id"] for x in client.get("/api/admin/smes", headers=b).json() if x["owner_email"] == "boss@tressa.app")
    assert client.patch(f"/api/admin/smes/{me}", json={"status": "suspended"}, headers=b).status_code == 409


def test_reset_link_and_no_customer_data(client):
    b = boss(client)
    sme = signup(client)
    client.post("/api/customers", json={"name": "Secret Customer", "phone": "0501112233"}, headers=sme)
    sid = next(x["id"] for x in client.get("/api/admin/smes", headers=b).json() if x["owner_email"] == "owner@layla.ae")
    link = client.post(f"/api/admin/smes/{sid}/reset-link", headers=b).json()
    assert "/reset-password?token=" in link["link"] and link["email"] == "owner@layla.ae"
    detail = client.get(f"/api/admin/smes/{sid}", headers=b).text
    assert "Secret Customer" not in detail and "0501112233" not in detail
    assert '"customers":1' in detail.replace(" ", "")
