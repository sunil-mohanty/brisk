"""Staff management: profiles, skills, hours, logins and permissions, appointment assignment,
attendance, leave, commission and performance."""

from datetime import date, datetime, timedelta

from app.activity import UAE

from .conftest import signup


def _menu(client, h):
    items = client.post("/api/catalog", json=[
        {"name": "Haircut", "unit_price": 100, "category": "Hair", "duration_min": 60},
        {"name": "Gel manicure", "unit_price": 100, "category": "Nails", "duration_min": 60},
    ], headers=h).json()
    return {i["name"]: i["id"] for i in items}


def _staff(client, h, name, **extra):
    r = client.post("/api/staff", json={"name": name, "phone": "0501234567", **extra}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _day(n=7) -> date:
    return datetime.now(UAE).date() + timedelta(days=n)


def _at(d: date, hh: int, mm: int = 0) -> str:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=UAE).isoformat()


def _book(client, h, when, service="Haircut", **extra):
    return client.post("/api/appointments", json={"new_customer": {"name": "Sara Ali", "phone": "0551112233"}, "service": service,
                                                  "starts_at": when, "duration_min": 60, "price": 105, **extra}, headers=h)


def test_profile_skills_hours_and_commission_settings(client):
    h = signup(client)
    menu = _menu(client, h)
    st = _staff(client, h, "Layla", role="Senior stylist", email="layla@x.ae")
    assert st["custom_hours"] is False and st["working_hours"]["0"] == ["10:00", "22:00"] and st["permissions"] == ["phones", "earnings"]
    r = client.patch(f"/api/staff/{st['id']}", json={
        "skill_ids": [menu["Haircut"], 999999], "working_hours": {"0": ["09:00", "17:00"], "4": None},
        "commission_rate": 20, "commission_by_category": {"Hair": 30},
    }, headers=h).json()
    assert r["skill_ids"] == [menu["Haircut"]] and r["custom_hours"] and r["working_hours"]["0"] == ["09:00", "17:00"]
    assert r["working_hours"]["4"] is None and r["working_hours"]["1"] is None  # only the days given
    assert float(r["commission_by_category"]["Hair"]) == 30 and float(r["commission_rate"]) == 20
    assert client.patch(f"/api/staff/{st['id']}", json={"working_hours": {"0": ["17:00", "09:00"]}}, headers=h).status_code == 422
    lst = client.get("/api/staff", headers=h).json()
    assert lst["categories"] == ["Hair", "Nails"] and "diary_all" in lst["permissions"] and lst["staff"][0]["today"]


def test_assignment_follows_hours_leave_and_skills(client):
    h = signup(client)
    menu = _menu(client, h)
    d = _day()
    a = _staff(client, h, "Amal")
    b = _staff(client, h, "Bea")
    c = _staff(client, h, "Cara")
    client.patch(f"/api/staff/{b['id']}", json={"skill_ids": [menu["Gel manicure"]]}, headers=h)  # nails only
    client.patch(f"/api/staff/{c['id']}", json={"working_hours": {str(d.weekday()): None}}, headers=h)  # day off
    av = {x["name"]: x for x in client.get("/api/staff/availability", params={"start": _at(d, 11), "minutes": 60, "service": "Haircut"}, headers=h).json()}
    assert av["Amal"]["ok"] and av["Bea"]["reason"].startswith("Doesn't do") and av["Cara"]["reason"] == "Day off"
    # booking someone who's off is stopped (the owner can still book anyway)
    r = _book(client, h, _at(d, 11), stylist_id=c["id"])
    assert r.status_code == 409 and "Day off" in r.json()["detail"]["message"]
    assert _book(client, h, _at(d, 11), stylist_id=c["id"], force=True).status_code == 201
    # auto-assign: Amal is the only one who can do a haircut; then she's busy, so the next one fails
    first = _book(client, h, _at(d, 12), auto_assign=True).json()
    assert first["stylist"]["name"] == "Amal"
    assert _book(client, h, _at(d, 12), auto_assign=True).status_code == 409
    # nails: Amal (default: does everything) and Bea; Bea is less busy so she gets it
    assert _book(client, h, _at(d, 14), service="Gel manicure", auto_assign=True).json()["stylist"]["name"] == "Bea"
    # approved leave takes Amal out of the diary and of online booking
    client.post("/api/staff/leave", json={"stylist_id": a["id"], "start_date": str(d), "end_date": str(d)}, headers=h)
    av = {x["name"]: x for x in client.get("/api/staff/availability", params={"start": _at(d, 16), "service": "Haircut"}, headers=h).json()}
    assert av["Amal"]["reason"] == "On leave"
    from app import booking
    from app.db import SessionLocal
    from app.models import Business

    with SessionLocal() as db:
        biz = db.get(Business, client.get("/api/me", headers=h).json()["business"]["id"])
        assert booking.free_slots(db, biz, d, 60, "Haircut") == []  # nobody left who does haircuts that day
        assert booking.free_slots(db, biz, d, 60, "Gel manicure")  # Bea still can


def _login_for(client, h, st, role="staff"):
    r = client.put(f"/api/staff/{st['id']}/login", json={"email": f"{st['name'].lower()}@team.ae", "role": role}, headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["password"] and out["whatsapp_url"].startswith("https://wa.me/971501234567")
    tok = client.post("/api/auth/login", json={"email": out["email"], "password": out["password"]}).json()
    return {"Authorization": f"Bearer {tok['token']}"}, tok["user"]


def test_staff_login_and_permissions(client):
    h = signup(client)
    _menu(client, h)
    d = _day()
    a = _staff(client, h, "Amal")
    b = _staff(client, h, "Bea")
    _book(client, h, _at(d, 11), stylist_id=a["id"])
    _book(client, h, _at(d, 13), stylist_id=b["id"])
    sh, su = _login_for(client, h, a)
    assert su["role"] == "staff" and su["stylist_id"] == a["id"] and set(su["permissions"]) == {"phones", "earnings"}
    # her own diary only
    mine = client.get("/api/appointments", params={"start": str(d), "end": str(d)}, headers=sh).json()
    assert [x["stylist"]["name"] for x in mine] == ["Amal"] and mine[0]["customer"]["phone"]
    bea_appt = client.get("/api/appointments", params={"start": str(d), "end": str(d)}, headers=h).json()[1]
    assert client.get(f"/api/appointments/{bea_appt['id']}", headers=sh).status_code == 404
    for path in ("/api/customers", "/api/dashboard", "/api/staff", "/api/campaigns", "/api/quotes"):
        assert client.get(path, headers=sh).status_code == 403, path
    assert client.patch("/api/business", json={"name": "X"}, headers=sh).status_code == 403
    assert client.post("/api/catalog", json=[{"name": "x", "unit_price": 1}], headers=sh).status_code == 403
    assert client.get("/api/catalog", headers=sh).status_code == 200
    assert _book(client, sh, _at(d, 15)).status_code == 403  # no "book" permission
    # she can mark her own client arrived and finish the job
    assert client.patch(f"/api/appointments/{mine[0]['id']}", json={"status": "arrived"}, headers=sh).status_code == 200
    assert client.patch(f"/api/appointments/{mine[0]['id']}", json={"duration_min": 90}, headers=sh).status_code == 403
    # the owner changes what she can do
    client.put(f"/api/staff/{a['id']}/permissions", json={"permissions": ["diary_all", "clients", "book"]}, headers=h)
    sh, _ = _login_for(client, h, a)  # (a reset password signs her in again)
    allx = client.get("/api/appointments", params={"start": str(d), "end": str(d)}, headers=sh).json()
    assert len(allx) == 2 and all(x["customer"]["phone"] is None for x in allx)  # no "phones" now
    assert client.get("/api/customers", headers=sh).status_code == 200
    assert _book(client, sh, _at(d, 16)).status_code == 201  # books for herself by default
    # her own day page
    me = client.get("/api/staff/me", headers=sh).json()
    assert me["staff"]["name"] == "Amal" and me["earnings"] is None  # "earnings" was taken away
    # change password
    assert client.post("/api/me/password", json={"current_password": "wrong", "new_password": "newpassword1"}, headers=sh).status_code == 422
    # leaving the team switches the login off
    client.delete(f"/api/staff/{a['id']}", headers=h)
    assert client.get("/api/staff/me", headers=sh).status_code == 401
    assert client.post("/api/auth/login", json={"email": "amal@team.ae", "password": "x"}).status_code == 401


def test_manager_runs_the_day_but_not_pay_or_logins(client):
    h = signup(client)
    a = _staff(client, h, "Amal")
    m = _staff(client, h, "Mona")
    mh, mu = _login_for(client, h, m, role="manager")
    assert mu["role"] == "manager" and "diary_all" in mu["permissions"]
    assert client.get("/api/staff", headers=mh).status_code == 200
    assert client.get("/api/customers", headers=mh).status_code == 200
    assert client.patch(f"/api/staff/{a['id']}", json={"working_hours": {"0": ["10:00", "18:00"]}}, headers=mh).status_code == 200
    assert client.patch(f"/api/staff/{a['id']}", json={"commission_rate": 50}, headers=mh).status_code == 403
    assert client.put(f"/api/staff/{a['id']}/login", json={"email": "z@z.ae"}, headers=mh).status_code == 403
    assert client.put(f"/api/staff/{a['id']}/permissions", json={"permissions": []}, headers=mh).status_code == 403
    # another business never sees these people
    other = signup(client, email="o@o.ae", business="Other")
    assert client.get(f"/api/staff/{a['id']}", headers=other).status_code == 404
    assert client.put(f"/api/staff/{a['id']}/login", json={"email": "q@q.ae"}, headers=other).status_code == 404
    # an email that already has a login can't be reused
    assert client.put(f"/api/staff/{a['id']}/login", json={"email": "o@o.ae"}, headers=h).status_code == 409


def test_attendance_clock_and_corrections(client):
    h = signup(client)
    a = _staff(client, h, "Amal")
    sh, _ = _login_for(client, h, a)
    assert client.post("/api/staff/me/clock", json={"action": "out"}, headers=sh).status_code == 409
    t = client.post("/api/staff/me/clock", json={"action": "in"}, headers=sh).json()
    assert t["clock_in"] and t["status"] in ("working", "late", "present")
    assert client.post("/api/staff/me/clock", json={"action": "in"}, headers=sh).status_code == 409
    assert client.post("/api/staff/me/clock", json={"action": "out"}, headers=sh).json()["clock_out"]
    # the owner fixes yesterday: in at 10:30 (late, hours are 10:00-22:00), out at 18:30
    y = datetime.now(UAE).date() - timedelta(days=1)
    r = client.put(f"/api/staff/{a['id']}/attendance/{y}", json={"clock_in": "10:30", "clock_out": "18:30", "note": "Traffic"}, headers=h).json()
    assert r["status"] == "late" and r["minutes"] == 480 and r["edited"]
    assert client.put(f"/api/staff/{a['id']}/attendance/{y}", json={"clock_in": "18:00", "clock_out": "10:00"}, headers=h).status_code == 422
    two = y - timedelta(days=1)
    assert client.put(f"/api/staff/{a['id']}/attendance/{two}", json={"absent": True}, headers=h).json()["status"] == "absent"
    assert client.put(f"/api/staff/{a['id']}/attendance/{_day(2)}", json={"absent": True}, headers=h).status_code == 422
    grid = client.get("/api/staff/attendance", params={"start": str(two), "end": str(y)}, headers=h).json()[0]
    assert [d["status"] for d in grid["days"]] == ["absent", "late"] and grid["late"] == 1 and grid["absent"] == 1 and grid["worked_minutes"] == 480


def test_leave_requests(client):
    h = signup(client)
    a = _staff(client, h, "Amal")
    sh, _ = _login_for(client, h, a)
    d1, d2 = _day(10), _day(12)
    _book(client, h, _at(_day(11), 11), stylist_id=a["id"])
    assert client.post("/api/staff/me/leave", json={"start_date": str(d2), "end_date": str(d1)}, headers=sh).status_code == 422
    assert client.post("/api/staff/me/leave", json={"start_date": str(_day(-3)), "end_date": str(_day(-2))}, headers=sh).status_code == 422
    sick = client.post("/api/staff/me/leave", json={"kind": "sick", "start_date": str(_day(-1)), "end_date": str(_day(-1))}, headers=sh)
    assert sick.status_code == 201
    lv = client.post("/api/staff/me/leave", json={"start_date": str(d1), "end_date": str(d2), "reason": "Family wedding"}, headers=sh).json()
    assert lv["status"] == "pending" and lv["days"] == 3 and lv["clashes"] == 1
    assert client.get("/api/staff", headers=h).json()["pending_leave"] == 2
    out = client.post(f"/api/staff/leave/{lv['id']}/decide", json={"approve": True, "reply": "Enjoy!"}, headers=h).json()
    assert out["status"] == "approved" and out["reply"] == "Enjoy!"
    assert client.delete(f"/api/staff/me/leave/{lv['id']}", headers=sh).status_code == 409  # already decided
    assert client.delete(f"/api/staff/me/leave/{sick.json()['id']}", headers=sh).status_code == 204
    assert [x["status"] for x in client.get("/api/staff/me", headers=sh).json()["leave"]] == ["approved", "cancelled"]
    assert client.post(f"/api/staff/leave/{lv['id']}/decide", json={"approve": True}, headers=sh).status_code == 403


def test_commission_by_category_and_performance(client):
    h = signup(client)
    _menu(client, h)
    a = _staff(client, h, "Amal")
    b = _staff(client, h, "Bea")
    client.patch(f"/api/staff/{a['id']}", json={"commission_rate": 10, "commission_by_category": {"Hair": 30}}, headers=h)
    d = datetime.now(UAE).date()
    # two finished jobs for Amal today: a haircut (AED 105 with VAT) and haircut + manicure (AED 210)
    for svc, price, hh in (("Haircut", 105, 9), ("Haircut + Gel manicure", 210, 10)):
        ap = _book(client, h, _at(d, hh), service=svc, stylist_id=a["id"], price=price, force=True).json()
        assert client.post(f"/api/appointments/{ap['id']}/complete", json={}, headers=h).status_code == 200
    noshow = _book(client, h, _at(d, 12), stylist_id=b["id"], force=True).json()
    client.patch(f"/api/appointments/{noshow['id']}", json={"status": "no_show"}, headers=h)
    c = client.get("/api/staff/commission", params={"start": str(d), "end": str(d)}, headers=h).json()
    amal = next(r for r in c["rows"] if r["name"] == "Amal")
    # before VAT: 100 + 200 = 300; Hair 200 at 30% = 60, Nails 100 at the default 10% = 10
    assert float(amal["sales"]) == 315 and float(amal["net_sales"]) == 300 and amal["services"] == 2
    lines = {ln["category"]: (float(ln["sales"]), float(ln["rate"]), float(ln["commission"])) for ln in amal["lines"]}
    assert lines == {"Hair": (200, 30, 60), "Nails": (100, 10, 10)} and float(amal["commission"]) == 70
    assert float(c["total_commission"]) == 70 and any(r["name"] == "Bea" and r["services"] == 0 for r in c["rows"])
    csv = client.get("/api/staff/commission.csv", params={"start": str(d), "end": str(d)}, headers=h)
    assert csv.headers["content-type"].startswith("text/csv") and "Amal,TOTAL,2,315.00,300.00,,70.00" in csv.text
    rep = {r["name"]: r for r in client.get("/api/staff/report", params={"start": str(d), "end": str(d)}, headers=h).json()["rows"]}
    assert rep["Amal"]["completed"] == 2 and float(rep["Amal"]["avg_ticket"]) == 157.5 and rep["Amal"]["clients"] == 1
    assert rep["Bea"]["no_shows"] == 1 and rep["Amal"]["scheduled_hours"] == 12 and rep["Amal"]["utilisation"] == 17
    # the staff member sees their own earnings this month
    sh, _ = _login_for(client, h, a)
    earn = client.get("/api/staff/me", headers=sh).json()["earnings"]
    assert [r["name"] for r in earn["rows"]] == ["Amal"] and float(earn["rows"][0]["commission"]) == 70
