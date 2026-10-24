"""Quotes clients accept and book on the spot, campaign offers, bulk quotes, inventory, WhatsApp."""

from datetime import datetime, timedelta, timezone

from .conftest import signup

UAE = timezone(timedelta(hours=4))


def _future_day(days=2):
    d = datetime.now(UAE).date() + timedelta(days=days)
    return d.isoformat()


def _setup(client):
    h = signup(client)
    client.patch("/api/business", json={"open_time": "10:00", "close_time": "20:00", "closed_days": ""}, headers=h)
    client.post("/api/catalog", json=[{"name": "Gel manicure", "unit_price": 90, "duration_min": 45}], headers=h)
    maya = client.post("/api/team", json={"name": "Maya"}, headers=h).json()
    return h, maya


def _quote(client, h, name="Sara", phone="055 111 2233"):
    return client.post("/api/quotes", json={"new_customer": {"name": name, "phone": phone},
                                            "items": [{"description": "Gel manicure", "unit_price": 90}]}, headers=h).json()


def test_accept_and_book_free_slot_confirms_and_queues_whatsapp(client):
    h, maya = _setup(client)
    q = _quote(client, h)
    day = _future_day()
    pub = client.get(f"/api/public/q/{q['token']}").json()
    assert pub["duration_min"] == 45 and pub["open_days"] == [0, 1, 2, 3, 4, 5, 6]
    slots = client.get(f"/api/public/q/{q['token']}/slots?day={day}").json()
    assert slots["slots"][0] == "10:00" and slots["slots"][-1] == "19:00"  # 45 min must fit before 20:00

    r = client.post(f"/api/public/q/{q['token']}/accept", json={"day": day, "time": "11:00"}).json()
    assert r["status"] == "accepted" and r["booking_status"] == "confirmed"
    assert r["stylist"] == "Maya" and r["appointment_token"]

    appts = client.get(f"/api/appointments?start={day}&end={day}", headers=h).json()
    assert len(appts) == 1 and appts[0]["status"] == "confirmed" and appts[0]["quote_id"] == q["id"] and appts[0]["duration_min"] == 45
    owner_view = client.get(f"/api/quotes/{q['id']}", headers=h).json()
    assert owner_view["booking_status"] == "confirmed" and owner_view["appointment_id"] == appts[0]["id"]

    # WhatsApp isn't connected in tests, so the confirmation waits for the owner as a one-tap link
    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["whatsapp_auto"] is False and len(dash["to_send"]) == 1
    msg = dash["to_send"][0]
    assert msg["whatsapp_url"].startswith("https://wa.me/971551112233") and "is confirmed for" in msg["body"]
    assert client.post(f"/api/messages/{msg['id']}/done", headers=h).status_code == 204
    assert client.get("/api/messages/pending", headers=h).json() == []

    # The slot is now gone for the only stylist
    assert "11:00" not in client.get(f"/api/public/q/{q['token']}/slots?day={day}").json()["slots"]


def test_accept_without_time_waits_then_books_later(client):
    h, _ = _setup(client)
    q = _quote(client, h)
    r = client.post(f"/api/public/q/{q['token']}/accept").json()
    assert r["status"] == "accepted" and r["booking_status"] == "awaiting"
    dash = client.get("/api/dashboard", headers=h).json()
    assert [x["id"] for x in dash["awaiting_booking"]] == [q["id"]]
    day = _future_day(3)
    booked = client.post(f"/api/public/q/{q['token']}/book", json={"day": day, "time": "15:30"}).json()
    assert booked["booking_status"] == "confirmed"
    assert client.post(f"/api/public/q/{q['token']}/book", json={"day": day, "time": "16:30"}).status_code == 409


def test_taken_slot_leaves_quote_awaiting(client):
    h, maya = _setup(client)
    day = _future_day()
    client.post("/api/appointments", json={"new_customer": {"name": "Walk-in"}, "service": "Cut", "starts_at": f"{day}T11:00:00+04:00",
                                           "duration_min": 60, "stylist_id": maya["id"]}, headers=h)
    q = _quote(client, h)
    assert "11:00" not in client.get(f"/api/public/q/{q['token']}/slots?day={day}").json()["slots"]
    r = client.post(f"/api/public/q/{q['token']}/accept", json={"day": day, "time": "11:00"}).json()
    assert r["status"] == "accepted" and r["booking_status"] == "awaiting" and r["appointment_token"] is None


def test_owner_booking_an_awaiting_quote_confirms_it(client):
    h, maya = _setup(client)
    q = _quote(client, h)
    client.post(f"/api/public/q/{q['token']}/accept")
    client.post("/api/appointments", json={"quote_id": q["id"], "service": "Gel manicure", "starts_at": f"{_future_day()}T13:00:00+04:00",
                                           "stylist_id": maya["id"]}, headers=h)
    assert client.get(f"/api/quotes/{q['id']}", headers=h).json()["booking_status"] == "confirmed"


def test_closed_days_and_hours(client):
    h, _ = _setup(client)
    day = datetime.now(UAE).date() + timedelta(days=2)
    client.patch("/api/business", json={"closed_days": str(day.weekday())}, headers=h)
    q = _quote(client, h)
    assert client.get(f"/api/public/q/{q['token']}/slots?day={day.isoformat()}").json()["slots"] == []
    assert day.weekday() not in client.get(f"/api/public/q/{q['token']}").json()["open_days"]
    assert client.patch("/api/business", json={"open_time": "9am"}, headers=h).status_code == 422


def test_campaign_offer_accept_and_book(client):
    h, maya = _setup(client)
    camp = client.post("/api/campaigns", json={
        "title": "Bridal glow package", "description": "Hair, makeup and trial", "duration_min": 120,
        "items": [{"description": "Bridal hair & makeup", "unit_price": 1500}, {"description": "Trial session", "unit_price": 300}],
        "discount": 300, "valid_until": _future_day(20),
    }, headers=h).json()
    assert camp["totals"]["total"] == "1575.00" and camp["public_url"].endswith(f"/c/{camp['token']}")
    assert "Accept and book" in camp["share_text"]
    qr = client.get(f"/api/campaigns/{camp['id']}/qr", headers=h)
    assert qr.status_code == 200 and qr.content[:4] == b"\x89PNG"

    pub = client.get(f"/api/public/c/{camp['token']}").json()
    assert pub["title"] == "Bridal glow package" and pub["active"] and not pub["expired"]
    day = _future_day(4)
    assert client.get(f"/api/public/c/{camp['token']}/slots?day={day}").json()["duration_min"] == 120

    r = client.post(f"/api/public/c/{camp['token']}/accept", json={"name": "Aisha", "phone": "056 777 8899", "day": day, "time": "10:00"}).json()
    assert r["booking_status"] == "confirmed" and not r["slot_taken"]
    q = client.get(f"/api/public/q/{r['quote_token']}").json()
    assert q["status"] == "accepted" and q["customer_name"] == "Aisha" and q["totals"]["total"] == "1575.00"

    # Same slot again: Maya is busy, so the second client is accepted but waits for a booking
    r2 = client.post(f"/api/public/c/{camp['token']}/accept", json={"name": "Huda", "phone": "050 333 4444", "day": day, "time": "10:00"}).json()
    assert r2["booking_status"] == "awaiting" and r2["slot_taken"]

    owner = client.get(f"/api/campaigns/{camp['id']}", headers=h).json()
    assert owner["views"] == 1 and owner["accepted"] == 2 and owner["booked"] == 1
    responses = client.get(f"/api/campaigns/{camp['id']}/responses", headers=h).json()
    assert {x["kind"] for x in responses} == {"campaign"} and responses[0]["campaign_title"] == "Bridal glow package"
    leads = client.get("/api/leads", headers=h).json()
    assert {l["source"] for l in leads} == {"Campaign: Bridal glow package"}

    # Paused offers can't be accepted
    client.put(f"/api/campaigns/{camp['id']}", json={**{k: camp[k] for k in ("title", "description", "duration_min", "valid_until")},
                                                    "items": [{"description": "Bridal hair & makeup", "unit_price": 1500}], "active": False}, headers=h)
    assert client.post(f"/api/public/c/{camp['token']}/accept", json={"name": "Z", "phone": "0501234567"}).status_code == 409


def test_bulk_quotes_one_link_each(client):
    h, _ = _setup(client)
    ids = [client.post("/api/customers", json={"name": n, "phone": p}, headers=h).json()["id"]
           for n, p in [("A One", "0501111111"), ("B Two", "0502222222"), ("C Three", "0503333333")]]
    qs = client.post("/api/quotes/bulk", json={"customer_ids": ids, "items": [{"description": "Eid package", "unit_price": 250}],
                                               "reference": "Eid offer"}, headers=h).json()
    assert len(qs) == 3 and len({q["token"] for q in qs}) == 3
    assert [q["customer"]["name"] for q in qs] == ["A One", "B Two", "C Three"]
    assert qs[1]["whatsapp_url"].startswith("https://wa.me/971502222222?text=")
    assert client.post("/api/quotes/bulk", json={"customer_ids": [999], "items": [{"description": "x", "unit_price": 1}]}, headers=h).status_code == 404


def test_inventory_stock_moves(client):
    h, _ = _setup(client)
    item = client.post("/api/inventory", json={"name": "Developer 20 vol 1L", "category": "Colour", "unit": "bottle", "stock": 6,
                                              "low_stock": 2, "cost_price": 28, "supplier": "Beauty Supplies LLC"}, headers=h).json()
    assert item["stock"] == "6.00" and item["low"] is False
    item = client.post(f"/api/inventory/{item['id']}/move", json={"change": 4, "reason": "used"}, headers=h).json()
    assert item["stock"] == "2.00" and item["low"] is True
    assert client.get("/api/dashboard", headers=h).json()["low_stock"] == 1
    item = client.post(f"/api/inventory/{item['id']}/move", json={"change": 12, "reason": "received", "note": "Invoice 4411"}, headers=h).json()
    item = client.post(f"/api/inventory/{item['id']}/move", json={"change": 13, "reason": "adjust"}, headers=h).json()
    assert item["stock"] == "13.00"
    moves = client.get(f"/api/inventory/{item['id']}/moves", headers=h).json()
    assert [m["change"] for m in moves] == ["-1.00", "12.00", "-4.00", "6.00"]
    other = signup(client, "o@o.ae", "Other Salon")
    assert client.get(f"/api/inventory/{item['id']}/moves", headers=other).status_code == 404


def test_whatsapp_sent_automatically_when_connected(client, monkeypatch):
    from app import whatsapp
    from app.config import get_settings

    sent = []
    monkeypatch.setattr(get_settings(), "whatsapp_token", "t")
    monkeypatch.setattr(get_settings(), "whatsapp_phone_number_id", "123")
    monkeypatch.setattr(get_settings(), "whatsapp_template", "booking_confirmed")
    monkeypatch.setattr(whatsapp, "_post", lambda payload: (sent.append(payload), (True, None, "wamid.X"))[1])
    h, _ = _setup(client)
    q = _quote(client, h)
    client.post(f"/api/public/q/{q['token']}/accept", json={"day": _future_day(), "time": "12:00"})
    assert len(sent) == 1 and sent[0]["to"] == "971551112233" and sent[0]["template"]["name"] == "booking_confirmed"
    params = [p["text"] for p in sent[0]["template"]["components"][0]["parameters"]]
    assert params[0] == "Sara" and params[1] == "Gel manicure" and params[3] == "Layla Beauty Lounge"
    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["whatsapp_auto"] is True and dash["to_send"] == []


def test_admin_switches_link_page_on(client):
    boss = signup(client, "boss@tressa.app", "Platform HQ")
    salon = signup(client, "s@s.ae", "Rose Salon")
    sid = client.get("/api/me", headers=salon).json()["business"]["id"]
    assert client.get("/api/me", headers=salon).json()["business"]["link_page_enabled"] is False
    d = client.patch(f"/api/admin/smes/{sid}", json={"link_page_enabled": True}, headers=boss).json()
    assert d["link_page_enabled"] is True and d["slug"] == "rose-salon"
    assert client.get("/api/public/b/rose-salon").status_code == 200
    assert client.patch(f"/api/admin/smes/{sid}", json={"link_page_enabled": True}, headers=salon).status_code in (403, 404)
