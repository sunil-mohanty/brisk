"""WhatsApp Business API: quotes sent with buttons, accepted and booked inside WhatsApp (Meta is mocked)."""

import hashlib
import hmac
import itertools
import json
from datetime import datetime, timedelta, timezone

import pytest

from app import whatsapp
from app.config import get_settings

from .conftest import signup

UAE = timezone(timedelta(hours=4))
CLIENT = "971551112233"
_ids = itertools.count(1)


@pytest.fixture()
def wa(monkeypatch):
    st = get_settings()
    for k, v in {"whatsapp_token": "tok", "whatsapp_phone_number_id": "123", "whatsapp_template": "booking_confirmed",
                 "whatsapp_quote_template": "quote_offer", "whatsapp_verify_token": "verify-me",
                 "whatsapp_app_secret": "app-secret", "whatsapp_business_number": "971500000000"}.items():
        monkeypatch.setattr(st, k, v)
    sent = []

    def fake_post(payload):
        sent.append(payload)
        return True, None, f"wamid.OUT{len(sent)}"

    monkeypatch.setattr(whatsapp, "_post", fake_post)
    return sent


def _hook(client, messages=None, statuses=None, name="Sara Ali", secret="app-secret"):
    body = json.dumps({"object": "whatsapp_business_account", "entry": [{"changes": [{"field": "messages", "value": {
        "messaging_product": "whatsapp",
        "contacts": [{"wa_id": CLIENT, "profile": {"name": name}}],
        **({"messages": messages} if messages else {}),
        **({"statuses": statuses} if statuses else {}),
    }}]}]}).encode()
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return client.post("/api/whatsapp/webhook", content=body, headers={"x-hub-signature-256": sig, "content-type": "application/json"})


def _button(payload, wamid=None):
    return {"from": CLIENT, "id": wamid or f"wamid.IN{next(_ids)}", "type": "button", "button": {"payload": payload, "text": "Accept"}}


def _list(row_id):
    return {"from": CLIENT, "id": f"wamid.IN{next(_ids)}", "type": "interactive", "interactive": {"type": "list_reply", "list_reply": {"id": row_id, "title": "x"}}}


def _text(body):
    return {"from": CLIENT, "id": f"wamid.IN{next(_ids)}", "type": "text", "text": {"body": body}}


def _setup(client):
    h = signup(client)
    client.patch("/api/business", json={"open_time": "10:00", "close_time": "20:00", "closed_days": ""}, headers=h)
    client.post("/api/catalog", json=[{"name": "Gel manicure", "unit_price": 90, "duration_min": 45}], headers=h)
    client.post("/api/team", json={"name": "Maya"}, headers=h)
    q = client.post("/api/quotes", json={"new_customer": {"name": "Sara Ali", "phone": "055 111 2233"},
                                         "items": [{"description": "Gel manicure", "unit_price": 90}]}, headers=h).json()
    return h, q


def _rows(payload):
    return [r["id"] for r in payload["interactive"]["action"]["sections"][0]["rows"]]


def test_verify_handshake(client, wa):
    ok = client.get("/api/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42"})
    assert ok.status_code == 200 and ok.text == "42"
    assert client.get("/api/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1"}).status_code == 403


def test_bad_signature_is_refused(client, wa):
    assert _hook(client, [_text("hi")], secret="wrong").status_code == 401
    assert wa == []


def test_send_quote_accept_pick_day_and_time_books_it(client, wa):
    h, q = _setup(client)
    st = client.get("/api/whatsapp/status", headers=h).json()
    assert st == {"automatic": True, "quotes": True, "webhook": True, "business_number": "+971500000000"}

    r = client.post(f"/api/quotes/{q['id']}/whatsapp", headers=h).json()
    assert r["status"] == "sent"
    tpl = wa[-1]
    assert tpl["to"] == CLIENT and tpl["template"]["name"] == "quote_offer"
    comps = tpl["template"]["components"]
    assert [p["text"] for p in comps[0]["parameters"]][:4] == ["Sara", "Layla Beauty Lounge", "Gel manicure", "AED 94.50"]
    assert comps[1]["parameters"][0]["payload"] == f"accept:{q['token']}"
    assert comps[2]["parameters"][0]["payload"] == f"decline:{q['token']}"
    assert comps[3]["parameters"][0]["text"] == q["token"]

    # Meta reports delivered, then read
    _hook(client, statuses=[{"id": "wamid.OUT1", "status": "delivered"}])
    _hook(client, statuses=[{"id": "wamid.OUT1", "status": "read"}])
    owner = client.get(f"/api/quotes/{q['id']}", headers=h).json()
    assert owner["wa_status"] == "read" and owner["shared_at"]

    # Client taps Accept → accepted, list of days + Book later
    assert _hook(client, [_button(f"accept:{q['token']}")]).status_code == 200
    days = _rows(wa[-1])
    assert days[0].startswith(f"day:{q['token']}:") and days[-1] == f"later:{q['token']}"
    assert client.get(f"/api/quotes/{q['id']}", headers=h).json()["booking_status"] == "awaiting"

    # Picks the third day → list of times
    day = (datetime.now(UAE).date() + timedelta(days=2)).isoformat()
    _hook(client, [_list(f"day:{q['token']}:{day}")])
    times = _rows(wa[-1])
    assert times[0] == f"slot:{q['token']}:{day}:1000" and times[-2:] == [f"days:{q['token']}", f"later:{q['token']}"]
    assert len(times) == 10

    # Picks 10:00 → booked, confirmation template sent in the same chat
    _hook(client, [_list(times[0])])
    assert wa[-1]["template"]["name"] == "booking_confirmed"
    owner = client.get(f"/api/quotes/{q['id']}", headers=h).json()
    assert owner["status"] == "accepted" and owner["booking_status"] == "confirmed"
    appts = client.get(f"/api/appointments?start={day}&end={day}", headers=h).json()
    assert len(appts) == 1 and appts[0]["status"] == "confirmed"
    # Nothing waits on the owner's Today screen
    assert client.get("/api/messages/pending", headers=h).json() == []


def test_taken_slot_offers_other_times_and_book_later_waits(client, wa):
    h, q = _setup(client)
    q2 = client.post("/api/quotes", json={"new_customer": {"name": "Noor", "phone": "050 999 8877"},
                                          "items": [{"description": "Gel manicure", "unit_price": 90}]}, headers=h).json()
    day = (datetime.now(UAE).date() + timedelta(days=1)).isoformat()
    client.post(f"/api/public/q/{q2['token']}/accept", json={"day": day, "time": "10:00"})  # Noor takes 10:00 with the only stylist

    _hook(client, [_button(f"accept:{q['token']}")])
    _hook(client, [_list(f"slot:{q['token']}:{day}:1000")])
    assert "was just taken" in wa[-1]["interactive"]["body"]["text"]
    assert f"slot:{q['token']}:{day}:1000" not in _rows(wa[-1])

    _hook(client, [_list(f"later:{q['token']}")])
    assert "will message you to confirm a time" in wa[-1]["text"]["body"]
    owner = client.get(f"/api/quotes/{q['id']}", headers=h).json()
    assert owner["status"] == "accepted" and owner["booking_status"] == "awaiting"
    assert owner["customer"]["name"] in [x["customer"]["name"] for x in client.get("/api/dashboard", headers=h).json()["awaiting_booking"]]


def test_decline_and_duplicate_delivery(client, wa):
    h, q = _setup(client)
    m = _button(f"decline:{q['token']}", wamid="wamid.SAME")
    _hook(client, [m])
    _hook(client, [m])  # Meta retried
    assert client.get(f"/api/quotes/{q['id']}", headers=h).json()["status"] == "rejected"
    assert len(wa) == 1 and "let Layla Beauty Lounge know" in wa[0]["text"]["body"]


def test_typed_accept_uses_latest_quote(client, wa):
    h, q = _setup(client)
    client.post(f"/api/quotes/{q['id']}/whatsapp", headers=h)
    _hook(client, [_text("Yes please, accept")])
    assert client.get(f"/api/quotes/{q['id']}", headers=h).json()["status"] == "accepted"
    assert wa[-1]["interactive"]["type"] == "list"


def test_campaign_accepted_on_whatsapp(client, wa):
    h = signup(client)
    client.post("/api/team", json={"name": "Maya"}, headers=h)
    c = client.post("/api/campaigns", json={"title": "Bridal glow", "items": [{"description": "Bridal makeup", "unit_price": 800}]}, headers=h).json()
    assert c["whatsapp_accept_url"].startswith("https://wa.me/971500000000?text=") and c["token"] in c["whatsapp_accept_url"]
    assert client.get(f"/api/public/c/{c['token']}").json()["whatsapp_accept_url"] == c["whatsapp_accept_url"]

    _hook(client, [_text(f'Hi! I\'d like to accept the offer "Bridal glow" from Layla Beauty Lounge (code {c["token"]})')], name="Hessa M")
    assert "is accepted" in wa[-1]["interactive"]["body"]["text"]
    quotes = client.get("/api/quotes?kind=campaign", headers=h).json()
    assert len(quotes) == 1 and quotes[0]["customer"]["name"] == "Hessa M" and quotes[0]["customer"]["phone"] == "+971551112233"
    assert quotes[0]["status"] == "accepted" and quotes[0]["booking_status"] == "awaiting"


def test_without_whatsapp_send_falls_back_to_link(client):
    h, q = _setup(client)
    r = client.post(f"/api/quotes/{q['id']}/whatsapp", headers=h).json()
    assert r["status"] == "manual" and r["whatsapp_url"].startswith("https://wa.me/971551112233")


def test_bulk_send(client, wa):
    h, q = _setup(client)
    q2 = client.post("/api/quotes", json={"new_customer": {"name": "Noor", "phone": "050 999 8877"},
                                          "items": [{"description": "Gel manicure", "unit_price": 90}]}, headers=h).json()
    r = client.post("/api/quotes/whatsapp-bulk", json={"quote_ids": [q["id"], q2["id"]]}, headers=h).json()
    assert r == {"sent": 2, "failed": 0, "manual": 0}
    assert {p["to"] for p in wa} == {CLIENT, "971509998877"}
