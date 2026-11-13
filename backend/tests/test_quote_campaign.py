"""Quote & Campaign: one quote for many clients (saved or brand new, with a picture), and Campaigns as an add-on."""

import io

from PIL import Image

from .conftest import signup
from .test_admin import boss


def _png():
    b = io.BytesIO()
    Image.new("RGB", (400, 500), (200, 120, 90)).save(b, "PNG")
    return b.getvalue()


def test_bulk_quote_with_new_clients_and_a_brochure(client):
    h = signup(client)
    sara = client.post("/api/customers", json={"name": "Sara Ali", "phone": "0501112233"}, headers=h).json()
    m = client.post("/api/media", files={"file": ("offer.png", _png(), "image/png")}, headers=h).json()
    r = client.post("/api/quotes/bulk", json={
        "customer_ids": [sara["id"]],
        "new_customers": [{"name": "Mona Haddad", "phone": "055 222 3344"}, {"name": "Sara again", "phone": "+971 50 111 2233"}],
        "attachment_id": m["id"], "reference": "Eid offer",
    }, headers=h)
    assert r.status_code == 201, r.text
    qs = r.json()
    # Sara's number was already saved, so "Sara again" is matched to her: 2 quotes, not 3
    assert [q["customer"]["name"] for q in qs] == ["Sara Ali", "Mona Haddad"]
    assert all(q["design_style"] == "upload" and q["picture_url"] for q in qs)
    assert "Mona Haddad" in [c["name"] for c in client.get("/api/customers", headers=h).json()]  # saved to the client list
    assert client.post("/api/quotes/bulk", json={"customer_ids": [sara["id"]]}, headers=h).status_code == 422  # nothing offered
    assert client.post("/api/quotes/bulk", json={"items": [{"description": "x", "unit_price": 1}]}, headers=h).status_code == 422  # nobody


def test_campaigns_addon_can_be_switched_off(client):
    h = signup(client)
    me = client.get("/api/me", headers=h).json()
    assert me["business"]["campaigns_enabled"] is True
    c = client.post("/api/campaigns", json={"title": "Glow week", "items": [{"description": "Facial", "unit_price": 200}]}, headers=h).json()
    a = boss(client)
    assert client.patch(f"/api/admin/smes/{me['business']['id']}", json={"campaigns_enabled": False}, headers=a).json()["campaigns_enabled"] is False
    r = client.get("/api/campaigns", headers=h)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "addon_off"
    assert client.post(f"/api/campaigns/{c['id']}/publish", json={"targets": ["facebook"]}, headers=h).status_code == 403
    assert client.get("/api/me", headers=h).json()["business"]["campaigns_enabled"] is False
    assert client.get("/api/quotes", headers=h).status_code == 200  # quotes are part of every plan
    client.patch(f"/api/admin/smes/{me['business']['id']}", json={"campaigns_enabled": True}, headers=a)
    assert client.get("/api/campaigns", headers=h).status_code == 200
