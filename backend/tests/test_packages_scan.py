"""Service packages, and reading a printed menu with AI (the AI is faked)."""

import io
import json

import httpx
import pytest
from PIL import Image

from app import menu_scan
from app.config import get_settings
from app.db import SessionLocal
from app.models import Business

from .conftest import signup

MENU = {"currency": "AED", "items": [
    {"name": "CLASSIC FACIAL", "price": 150, "price_from": False, "minutes": 60, "category": "SKIN", "includes": []},
    {"name": "Manicure", "price": "80", "minutes": 30, "category": "Nails", "includes": []},
    {"name": "Haircut – Long hair", "price": "from 120", "price_from": True, "minutes": None, "category": "Hair", "includes": []},
    {"name": "Bridal Glow Package", "price": 199, "minutes": None, "category": "Packages",
     "includes": [{"name": "Classic Facial", "qty": 1}, {"name": "Manicure", "qty": 1}]},
    {"name": "Manicure", "price": 80, "includes": []},
    {"name": "", "price": 10},
]}


class FakeAI:
    def __init__(self, reply=None, status=200):
        self.reply, self.status, self.calls = reply if reply is not None else MENU, status, []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        self.calls.append((str(req.url), req.headers.get("x-api-key") or req.headers.get("authorization"), body))
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": "bad"}})
        if "anthropic" in str(req.url) or "messages" in str(req.url):
            return httpx.Response(200, json={"content": [{"type": "text", "text": "Here you go:\n" + json.dumps(self.reply)}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(self.reply)}}]})


@pytest.fixture()
def ai(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "menu_scan_key", "sk-test")
    monkeypatch.setattr(st, "menu_scan_provider", "anthropic")
    monkeypatch.setattr(st, "menu_scans_per_month", 2)
    fake = FakeAI()
    monkeypatch.setattr(menu_scan, "_client", httpx.Client(transport=httpx.MockTransport(fake)))
    return fake


def photo(w=3000, h=2000) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(b, "PNG")
    return b.getvalue()


def test_packages_on_the_menu(client):
    h = signup(client)
    client.post("/api/catalog", json=[{"name": "Classic Facial", "unit_price": 150, "duration_min": 60},
                                      {"name": "Manicure", "unit_price": 80, "duration_min": 30}], headers=h)
    items = client.post("/api/catalog", json=[{"name": "Glow Package", "unit_price": 199, "category": "Packages",
                                               "includes": [{"name": "Classic Facial"}, {"name": "manicure", "qty": 2},
                                                            {"name": "Classic  Facial"}]}], headers=h).json()
    pkg = next(i for i in items if i["name"] == "Glow Package")
    assert pkg["includes"] == [{"name": "Classic Facial", "qty": 1}, {"name": "manicure", "qty": 2}]
    assert pkg["worth"] == "310.00" and pkg["duration_min"] == 120  # 150 + 2×80, 60 + 2×30
    # Edit what's inside; back to a plain service with []
    r = client.patch(f"/api/catalog/{pkg['id']}", json={"includes": [{"name": "Classic Facial"}]}, headers=h).json()
    assert r["worth"] == "150.00" and r["duration_min"] == 60
    r = client.patch(f"/api/catalog/{pkg['id']}", json={"includes": []}, headers=h).json()
    assert r["includes"] == [] and r["worth"] is None


def test_scan_reads_services_and_packages(client, ai):
    h = signup(client)
    client.post("/api/catalog", json=[{"name": "Manicure", "unit_price": 70}], headers=h)
    st = client.get("/api/catalog/scan", headers=h).json()
    assert st == {"enabled": True, "left": 2, "per_month": 2}
    r = client.post("/api/catalog/scan", files=[("files", ("menu.png", photo(), "image/png")),
                                                ("files", ("menu.pdf", b"%PDF-1.4 fake", "application/pdf"))], headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["currency"] == "AED" and out["left"] == 1
    names = [i["name"] for i in out["items"]]
    assert names == ["Classic Facial", "Manicure", "Haircut – Long hair", "Bridal Glow Package"]  # no repeats, no blanks
    fac, man, cut, pkg = out["items"]
    assert fac["unit_price"] == "150.00" and fac["duration_min"] == 60 and fac["category"] == "Skin"
    assert man["existing_id"] and man["existing_price"] == "70.00"  # already on the menu
    assert cut["unit_price"] == "120.00" and cut["price_from"] is True
    assert pkg["includes"] == [{"name": "Classic Facial", "qty": 1}, {"name": "Manicure", "qty": 1}]
    # What was sent: the photo made smaller and a PDF document, with the key
    url, key, body = ai.calls[0]
    assert key == "sk-test" and body["model"] == "claude-sonnet-5-5"
    blocks = body["messages"][0]["content"]
    assert [b["type"] for b in blocks] == ["image", "document", "text"]
    img = Image.open(io.BytesIO(__import__("base64").b64decode(blocks[0]["source"]["data"])))
    assert max(img.size) == 2000 and blocks[0]["source"]["media_type"] == "image/jpeg"
    # Nothing saved until the owner adds them
    assert len(client.get("/api/catalog", headers=h).json()) == 1
    items = client.post("/api/catalog", json=[{"name": i["name"], "unit_price": i["unit_price"], "category": i["category"],
                                               "duration_min": i["duration_min"], "price_from": i["price_from"],
                                               "includes": i["includes"]} for i in out["items"]], headers=h).json()
    pkg = next(i for i in items if i["name"] == "Bridal Glow Package")
    assert len(items) == 4 and pkg["worth"] == "230.00" and pkg["duration_min"] == 90
    assert next(i for i in items if i["name"] == "Manicure")["unit_price"] == "80.00"


def test_scan_allowance_and_errors(client, ai):
    h = signup(client)
    f = [("files", ("m.jpg", photo(400, 300), "image/jpeg"))]
    assert client.post("/api/catalog/scan", files=[("files", ("m.txt", b"hi", "text/plain"))], headers=h).status_code == 415
    ai.reply = {"items": []}
    assert client.post("/api/catalog/scan", files=f, headers=h).json()["items"] == []
    ai.status = 500
    r = client.post("/api/catalog/scan", files=f, headers=h)
    assert r.status_code == 422 and "busy" in r.json()["detail"]
    ai.status = 200
    client.post("/api/catalog/scan", files=f, headers=h)
    r = client.post("/api/catalog/scan", files=f, headers=h)
    assert r.status_code == 429  # 2 a month in this test
    with SessionLocal() as db:
        assert db.query(Business).one().menu_scans == 2


def test_scan_off_without_key(client):
    h = signup(client)
    assert client.get("/api/catalog/scan", headers=h).json()["enabled"] is False
    r = client.post("/api/catalog/scan", files=[("files", ("m.jpg", photo(100, 100), "image/jpeg"))], headers=h)
    assert r.status_code == 503


def test_openai_reader(client, ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "menu_scan_provider", "openai")
    h = signup(client)
    r = client.post("/api/catalog/scan", files=[("files", ("m.jpg", photo(100, 100), "image/jpeg"))], headers=h)
    assert r.status_code == 200 and len(r.json()["items"]) == 4
    assert ai.calls[-1][1] == "Bearer sk-test" and ai.calls[-1][2]["model"] == "gpt-4.1-mini"
    r = client.post("/api/catalog/scan", files=[("files", ("m.pdf", b"%PDF", "application/pdf"))], headers=h)
    assert r.status_code == 422 and "PDF" in r.json()["detail"]
