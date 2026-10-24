"""Salon features: team, appointments (jobs), the link-in-bio page and booking requests."""

from datetime import datetime, timedelta, timezone

from .conftest import enable_link_page, signup

UAE = timezone(timedelta(hours=4))


def _at(days=1, hour=11, minute=0) -> str:
    d = (datetime.now(UAE) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return d.isoformat()


def test_signup_gets_a_link_page_address(client):
    h = signup(client)
    me = client.get("/api/me", headers=h).json()
    assert me["business"]["slug"] == "layla-beauty-lounge"
    # Same name, different salon: still unique
    h2 = signup(client, "two@layla.ae", "Layla Beauty Lounge")
    assert client.get("/api/me", headers=h2).json()["business"]["slug"] == "layla-beauty-lounge-2"
    page = client.get("/api/linkpage", headers=h).json()
    assert page["url"] == "https://app.test/layla-beauty-lounge" and page["link_motion"] == "bloom"


def test_link_page_editing_and_public_view(client):
    h = signup(client)
    assert client.get("/api/public/b/layla-beauty-lounge").status_code == 404  # off until the admin enables it
    enable_link_page(client, h)
    upd = client.patch(
        "/api/linkpage",
        json={
            "slug": "Layla-Barsha", "bio": "Hair, nails & bridal · Al Barsha", "instagram": "https://instagram.com/layla.beauty/",
            "tiktok": "@laylabeauty", "link_theme": "rose", "link_motion": "shimmer", "hours": "Daily 10am–10pm",
        },
        headers=h,
    )
    assert upd.status_code == 200, upd.text
    page = upd.json()
    assert page["slug"] == "layla-barsha" and page["instagram"] == "layla.beauty" and page["tiktok"] == "laylabeauty"
    # Reserved and invalid addresses are refused
    assert client.patch("/api/linkpage", json={"slug": "dashboard"}, headers=h).status_code == 409
    assert client.patch("/api/linkpage", json={"slug": "a b"}, headers=h).status_code == 422
    assert client.patch("/api/linkpage", json={"link_motion": "explode"}, headers=h).status_code == 422
    # Taken by someone else
    other = signup(client, "x@x.ae", "Fade Barbers")
    enable_link_page(client, other)
    assert client.patch("/api/linkpage", json={"slug": "layla-barsha"}, headers=other).status_code == 409

    client.post("/api/linkpage/links", json={"label": "Bridal lookbook", "url": "layla.ae/bridal", "highlight": True}, headers=h)
    links = client.get("/api/linkpage", headers=h).json()["links"]
    assert links[0]["url"] == "https://layla.ae/bridal" and links[0]["highlight"] is True

    client.post("/api/catalog", json=[{"name": "Haircut & blow-dry", "unit_price": 120, "category": "Hair", "duration_min": 60}], headers=h)
    client.post("/api/team", json={"name": "Maya Haddad", "role": "Senior stylist"}, headers=h)

    # Owner preview doesn't count as a visit
    client.get("/api/public/b/layla-barsha?preview=1")
    pub = client.get("/api/public/b/LAYLA-BARSHA").json()
    assert pub["theme"] == "rose" and pub["motion"] == "shimmer"
    assert pub["socials"] == {"instagram": "https://instagram.com/layla.beauty", "tiktok": "https://www.tiktok.com/@laylabeauty"}
    assert pub["menu"][0] == {"name": "Haircut & blow-dry", "price": "120.00", "price_from": False, "duration_min": 60, "category": "Hair"}
    assert pub["team"][0]["initials"] == "MH"
    assert client.get("/api/public/b/no-such-salon").status_code == 404

    tap = client.post("/api/public/b/layla-barsha/tap", json={"kind": "link", "link_id": links[0]["id"]}).json()
    assert tap["url"] == "https://layla.ae/bridal"
    assert client.post("/api/public/b/layla-barsha/tap", json={"kind": "whatsapp"}).json()["url"].startswith("https://wa.me/971501234567")
    assert client.post("/api/public/b/layla-barsha/tap", json={"kind": "snapchat"}).status_code == 409  # not added

    stats = client.get("/api/linkpage", headers=h).json()
    assert stats["views"] == 1 and stats["views_7d"] == 1 and stats["taps_7d"] == {"link": 1, "whatsapp": 1}
    assert stats["links"][0]["clicks"] == 1


def test_booking_request_becomes_a_lead(client):
    h = signup(client)
    enable_link_page(client, h)
    slug = client.get("/api/linkpage", headers=h).json()["slug"]
    day = (datetime.now(UAE) + timedelta(days=3)).date().isoformat()
    r = client.post(
        f"/api/public/b/{slug}/book",
        json={"name": "Sara Ali", "phone": "055 111 2233", "services": ["Gel manicure", "Brow shaping"], "preferred_date": day,
              "preferred_time": "Evening", "stylist": "Maya", "note": "First visit"},
    )
    assert r.status_code == 201 and r.json()["whatsapp_url"].startswith("https://wa.me/971501234567")
    lead = client.get("/api/leads", headers=h).json()[0]
    assert lead["source"] == "Link page" and lead["service_interest"] == "Gel manicure, Brow shaping"
    assert lead["preferred_date"] == day and lead["preferred_time"] == "Evening" and lead["stylist_pref"] == "Maya"
    assert client.get("/api/linkpage", headers=h).json()["bookings_30d"] == 1
    # Owner can switch online requests off
    client.patch("/api/linkpage", json={"link_booking": False}, headers=h)
    assert client.post(f"/api/public/b/{slug}/book", json={"name": "Z", "phone": "0551112233"}).status_code == 409


def test_appointment_lifecycle(client):
    h = signup(client)
    maya = client.post("/api/team", json={"name": "Maya", "role": "Stylist"}, headers=h).json()
    assert maya["color"].startswith("#")

    # A lead books in
    lead = client.post("/api/leads", json={"new_customer": {"name": "Noor Saleh", "phone": "050 222 3344"}, "source": "Instagram",
                                           "service_interest": "Balayage"}, headers=h).json()
    body = {"lead_id": lead["id"], "service": "Balayage", "starts_at": _at(1, 11), "duration_min": 150, "price": 650, "stylist_id": maya["id"]}
    a = client.post("/api/appointments", json=body, headers=h)
    assert a.status_code == 201, a.text
    a = a.json()
    assert a["status"] == "booked" and a["customer"]["name"] == "Noor Saleh" and a["stylist"]["name"] == "Maya"
    assert a["public_url"] == f"https://app.test/a/{a['token']}"
    leads = client.get("/api/leads", headers=h).json()
    assert leads[0]["status"] == "won" and leads[0]["appointment_id"] == a["id"]

    # Maya is busy 11:00–13:30, so 12:00 clashes; another stylist or "book anyway" is fine
    clash = client.post("/api/appointments", json={"new_customer": {"name": "Huda"}, "service": "Blow-dry", "starts_at": _at(1, 12),
                                                    "duration_min": 45, "stylist_id": maya["id"]}, headers=h)
    assert clash.status_code == 409 and clash.json()["detail"]["code"] == "clash" and "Noor Saleh" in clash.json()["detail"]["message"]
    ok = client.post("/api/appointments", json={"new_customer": {"name": "Huda"}, "service": "Blow-dry", "starts_at": _at(1, 13, 30),
                                                 "duration_min": 45, "stylist_id": maya["id"]}, headers=h)
    assert ok.status_code == 201
    forced = client.post("/api/appointments", json={"new_customer": {"name": "Rana"}, "service": "Fringe trim", "starts_at": _at(1, 12),
                                                     "duration_min": 15, "stylist_id": maya["id"], "force": True}, headers=h)
    assert forced.status_code == 201
    # Cancelled bookings free the chair
    client.patch(f"/api/appointments/{forced.json()['id']}", json={"status": "cancelled"}, headers=h)

    # Diary for that day
    day = (datetime.now(UAE) + timedelta(days=1)).date().isoformat()
    diary = client.get(f"/api/appointments?start={day}&end={day}", headers=h).json()
    assert [x["service"] for x in diary] == ["Balayage", "Fringe trim", "Blow-dry"]

    # Confirm on WhatsApp
    msg = client.post(f"/api/appointments/{a['id']}/message?kind=confirm", headers=h).json()
    assert msg["whatsapp_url"].startswith("https://wa.me/971502223344") and "Balayage with Maya" in msg["message"]
    assert client.get(f"/api/appointments/{a['id']}", headers=h).json()["status"] == "confirmed"

    # Moving it needs confirming again, and is clash-checked
    assert client.patch(f"/api/appointments/{a['id']}", json={"starts_at": _at(1, 13)}, headers=h).status_code == 409
    moved = client.patch(f"/api/appointments/{a['id']}", json={"starts_at": _at(2, 10)}, headers=h).json()
    assert moved["status"] == "booked" and moved["confirmed_at"] is None

    # Client's page and calendar file
    pub = client.get(f"/api/public/a/{a['token']}").json()
    assert pub["service"] == "Balayage" and pub["stylist"] == "Maya" and pub["reschedule_url"].startswith("https://wa.me/")
    ics = client.get(f"/api/public/a/{a['token']}/ics")
    assert ics.status_code == 200 and "BEGIN:VEVENT" in ics.text and "SUMMARY:Balayage · Layla Beauty Lounge" in ics.text

    # Finish: records the visit with a rebook reminder
    done = client.post(f"/api/appointments/{a['id']}/complete", json={"price": 700, "notes": "7.1 + 20 vol", "next_visit_weeks": 8}, headers=h).json()
    assert done["status"] == "completed" and done["service_record_id"]
    visits = client.get("/api/services", headers=h).json()
    v = next(x for x in visits if x["id"] == done["service_record_id"])
    assert v["amount"] == "700.00" and v["technician"] == "Maya" and v["notes"] == "7.1 + 20 vol"
    start_day = datetime.fromisoformat(moved["starts_at"]).astimezone(UAE).date()
    assert v["next_service_date"] == (start_day + timedelta(weeks=8)).isoformat()
    assert client.post(f"/api/appointments/{a['id']}/complete", json={}, headers=h).status_code == 409
    assert client.delete(f"/api/appointments/{a['id']}", headers=h).status_code == 409
    assert client.patch(f"/api/appointments/{a['id']}", json={"status": "completed"}, headers=h).status_code == 409


def test_home_visit_and_quote_to_appointment(client):
    h = signup(client)
    q = client.post("/api/quotes", json={"new_customer": {"name": "Aisha", "phone": "056 777 8899"},
                                          "items": [{"description": "Bridal makeup & hair", "unit_price": 1800}]}, headers=h).json()
    body = {"quote_id": q["id"], "service": "Bridal makeup & hair", "starts_at": _at(10, 7), "duration_min": 180,
            "price": 1890, "location": "home", "address": "Villa 4, Arabian Ranches"}
    assert client.post("/api/appointments", json=body, headers=h).status_code == 409  # not accepted yet
    client.post(f"/api/public/q/{q['token']}/accept")
    a = client.post("/api/appointments", json=body, headers=h).json()
    assert a["customer"]["name"] == "Aisha" and a["location"] == "home" and a["quote_id"] == q["id"]
    assert client.get(f"/api/public/a/{a['token']}").json()["address"] == "Villa 4, Arabian Ranches"
    done = client.post(f"/api/appointments/{a['id']}/complete", json={}, headers=h).json()
    v = client.get("/api/services", headers=h).json()[0]
    assert done["status"] == "completed" and v["reference"] == "Home visit · Villa 4, Arabian Ranches" and v["next_service_date"] is None


def test_dashboard_today_and_setup(client):
    h = signup(client)
    d = client.get("/api/dashboard", headers=h).json()
    assert d["today"] == [] and d["setup"] == {"profile": False, "menu": False, "staff": False, "booked": False}
    now = datetime.now(UAE)
    later_today = now.replace(hour=23, minute=0, second=0, microsecond=0) if now.hour < 23 else now
    client.post("/api/appointments", json={"new_customer": {"name": "Lina"}, "service": "Beard trim", "starts_at": later_today.isoformat(),
                                           "duration_min": 30}, headers=h)
    client.post("/api/catalog", json=[{"name": "Beard trim", "unit_price": 40}], headers=h)
    d = client.get("/api/dashboard", headers=h).json()
    assert [x["service"] for x in d["today"]] == ["Beard trim"] and d["upcoming"] == 1
    assert d["setup"]["menu"] and d["setup"]["booked"]


def test_team_and_appointments_are_isolated(client):
    a = signup(client, "a@a.ae", "Alpha Salon")
    b = signup(client, "b@b.ae", "Beta Barbers")
    m = client.post("/api/team", json={"name": "Maya"}, headers=a).json()
    appt = client.post("/api/appointments", json={"new_customer": {"name": "X"}, "service": "Cut", "starts_at": _at(), "stylist_id": m["id"]}, headers=a).json()
    assert client.get(f"/api/appointments/{appt['id']}", headers=b).status_code == 404
    assert client.post("/api/appointments", json={"new_customer": {"name": "Y"}, "service": "Cut", "starts_at": _at(), "stylist_id": m["id"]}, headers=b).status_code == 404
    assert client.get("/api/team", headers=b).json() == []
    # Removing a team member keeps history but stops new bookings
    client.delete(f"/api/team/{m['id']}", headers=a)
    assert client.get("/api/team", headers=a).json() == []
    assert client.post("/api/appointments", json={"new_customer": {"name": "Z"}, "service": "Cut", "starts_at": _at(2), "stylist_id": m["id"]}, headers=a).status_code == 409


def test_qr_enquiry_carries_booking_details(client):
    h = signup(client)
    client.post("/api/catalog", json=[{"name": "Gel manicure", "unit_price": 90, "category": "Nails"}], headers=h)
    qr = client.post("/api/qr", json={"name": "Reception counter"}, headers=h).json()
    land = client.get(f"/api/public/l/{qr['code']}").json()
    assert land["menu"][0]["name"] == "Gel manicure"
    client.post(f"/api/public/l/{qr['code']}/enquiry", json={"name": "Mira", "phone": "0501231234", "service_interest": "Gel manicure", "preferred_time": "Morning"})
    lead = client.get("/api/leads", headers=h).json()[0]
    assert lead["service_interest"] == "Gel manicure" and lead["preferred_time"] == "Morning" and lead["source"] == "Reception counter"
