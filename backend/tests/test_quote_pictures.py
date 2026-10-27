"""Client quotes with an optional picture: uploaded image/PDF brochure, a designed banner, or an AI background."""

import io

import httpx
import pytest
from PIL import Image

from app import ai_art
from app.config import get_settings

from .conftest import signup

CUST = {"name": "Sara Ali", "phone": "055 111 2233"}


def _png(w=900, h=1200, color=(200, 120, 90)):
    buf = io.BytesIO()
    Image.new("RGBA", (w, h), color + (255,)).save(buf, "PNG")
    return buf.getvalue()


def _quote(client, h, items=(("Hydrating facial", 450),), **extra):
    r = client.post("/api/quotes", json={"new_customer": CUST, "items": [{"description": d, "unit_price": p} for d, p in items], **extra}, headers=h)
    return r


def test_plain_quote_has_no_picture(client):
    h = signup(client)
    q = _quote(client, h).json()
    assert q["design_style"] == "none" and q["picture_url"] is None and q["attachment"] is None
    assert client.get(f"/api/public/q/{q['token']}/picture/portrait.jpg").status_code == 404


def test_brochure_only_quote_with_a_pdf(client):
    h = signup(client)
    assert _quote(client, h, items=()).status_code == 422  # nothing at all
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    m = client.post("/api/media", files={"file": ("Bridal brochure.pdf", pdf, "application/pdf")}, headers=h).json()
    assert m["is_pdf"] and m["name"] == "Bridal brochure.pdf"
    q = _quote(client, h, items=(), attachment_id=m["id"]).json()
    assert q["design_style"] == "upload" and q["attachment"]["is_pdf"] and q["picture_url"] is None
    assert float(q["totals"]["total"]) == 0
    f = client.get(f"/api/public/q/{q['token']}/file")
    assert f.status_code == 200 and f.headers["content-type"] == "application/pdf" and f.content == pdf
    pub = client.get(f"/api/public/q/{q['token']}").json()
    assert pub["attachment"]["url"].endswith("/file") and pub["items"] == []
    # the client can still accept a brochure-only quote
    assert client.post(f"/api/public/q/{q['token']}/accept", json={}).json()["status"] == "accepted"


def test_upload_picture_to_existing_quote(client):
    h = signup(client)
    q = _quote(client, h).json()
    r = client.post(f"/api/quotes/{q['id']}/attachment", files={"file": ("offer.png", _png(), "image/png")}, headers=h)
    q2 = r.json()
    assert q2["design_style"] == "upload" and q2["picture_url"] and not q2["attachment"]["is_pdf"]
    assert q2["attachment"]["name"] == "offer.jpg"  # re-saved as JPEG, metadata removed
    pic = client.get(f"/api/public/q/{q['token']}/picture/portrait.jpg")
    assert pic.headers["content-type"] == "image/jpeg" and Image.open(io.BytesIO(pic.content)).size == (900, 1200)
    assert client.get(f"/api/public/q/{q['token']}").json()["picture_url"] == q2["picture_url"]
    bad = client.post(f"/api/quotes/{q['id']}/attachment", files={"file": ("x.txt", b"hello", "text/plain")}, headers=h)
    assert bad.status_code == 422
    # another business can't use this upload
    other = signup(client, email="x@o.ae", business="Other")
    m = client.post("/api/media", files={"file": ("a.png", _png(10, 10), "image/png")}, headers=h).json()
    assert _quote(client, other, attachment_id=m["id"]).status_code == 404


def test_designed_banner_from_the_quote(client):
    h = signup(client)
    q = _quote(client, h, items=(("Hydrating facial", 450), ("Organic peel", 400))).json()
    assert q["theme"] == "Skin & facial"
    for style in ("bold", "soft", "classic"):
        q2 = client.patch(f"/api/quotes/{q['id']}/design", json={"style": style}, headers=h).json()
        assert q2["design_style"] == style and q2["picture_url"]
        for fmt, size in (("portrait", (1080, 1350)), ("square", (1080, 1080))):
            img = Image.open(io.BytesIO(client.get(f"/api/public/q/{q['token']}/picture/{fmt}.jpg").content))
            assert img.size == size
    v1 = q2["picture_url"]
    assert client.patch(f"/api/quotes/{q['id']}/design", json={"shuffle": True}, headers=h).json()["picture_url"] != v1
    assert client.patch(f"/api/quotes/{q['id']}/design", json={"style": "none"}, headers=h).json()["picture_url"] is None
    assert client.patch(f"/api/quotes/{q['id']}/design", json={"style": "photo"}, headers=h).status_code == 409


@pytest.fixture()
def fal(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "ai_image_key", "k")
    monkeypatch.setattr(st, "ai_images_per_month", 3)
    calls = []

    def handler(req):
        calls.append(req)
        if req.url.host == "fal.run":
            return httpx.Response(200, json={"images": [{"url": "https://cdn.test/a.png"}]})
        return httpx.Response(200, content=_png(768, 1344, (90, 140, 120)))

    monkeypatch.setattr(ai_art, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    return calls


def test_ai_picture_for_a_quote_shares_the_allowance(client, fal):
    h = signup(client)
    q = _quote(client, h).json()
    assert q["ai_left"] == 3
    q2 = client.post(f"/api/quotes/{q['id']}/design/ai", headers=h).json()
    assert q2["design_style"] == "photo" and q2["has_ai_art"] and q2["ai_left"] == 2 and q2["picture_url"]
    Image.open(io.BytesIO(client.get(f"/api/public/q/{q['token']}/picture/story.jpg").content))
    # uploads don't count as AI pictures, and the AI picture is kept when a file is attached
    q3 = client.post(f"/api/quotes/{q['id']}/attachment", files={"file": ("o.png", _png(), "image/png")}, headers=h).json()
    assert q3["design_style"] == "upload" and q3["has_ai_art"]
    q4 = client.patch(f"/api/quotes/{q['id']}/design", json={"style": "photo"}, headers=h).json()
    assert q4["design_style"] == "photo" and q4["attachment"] and q4["ai_left"] == 2
    assert client.get(f"/api/public/q/{q['token']}").json()["attachment"] is None  # the client sees only the chosen picture
    c = client.post("/api/campaigns", json={"title": "Glow", "items": [{"description": "Facial", "unit_price": 1}]}, headers=h).json()
    assert c["ai_left"] == 2


def test_ai_picture_from_a_description_before_saving(client, fal):
    import json

    h = signup(client)
    assert client.get("/api/media/ai", headers=h).json()["ai_left"] == 3
    assert client.post("/api/media/ai", json={"description": ""}, headers=h).status_code == 422
    r = client.post("/api/media/ai", json={"description": "Relaxing spa room with candles & orchids"}, headers=h)
    assert r.status_code == 201, r.text
    pic = r.json()
    assert pic["preview"].startswith("data:image/jpeg;base64,") and pic["ai_left"] == 2
    prompt = json.loads(fal[0].content)["prompt"]
    assert "spa room with candles & orchids" in prompt and "No text" in prompt
    # a picture-only quote (no items): the AI picture is sent as it is
    q = _quote(client, h, items=(), ai_art_id=pic["id"]).json()
    assert q["design_style"] == "photo" and q["picture_url"]
    img = Image.open(io.BytesIO(client.get(f"/api/public/q/{q['token']}/picture/portrait.jpg").content))
    assert img.size == (768, 1344)  # the picture itself, no banner


def test_ai_picture_with_a_reference_photo(client, fal):
    import json

    h = signup(client)
    ref = client.post("/api/media", files={"file": ("salon.png", _png(), "image/png")}, headers=h).json()
    q = _quote(client, h).json()
    r = client.post(f"/api/quotes/{q['id']}/design/ai", json={"description": "Same room, warmer light", "reference_id": ref["id"]}, headers=h)
    assert r.status_code == 200, r.text
    body = json.loads(fal[0].content)
    assert str(fal[0].url).endswith("/image-to-image") and body["image_url"].startswith("data:image/jpeg;base64,")
    assert "reference photo" in body["prompt"]
    # with items, the AI picture becomes the background of the quote banner
    img = Image.open(io.BytesIO(client.get(f"/api/public/q/{q['token']}/picture/portrait.jpg").content))
    assert img.size == (1080, 1350)
    # another business's upload can't be used as a reference
    other = signup(client, email="z@o.ae", business="Other")
    oq = _quote(client, other).json()
    assert client.post(f"/api/quotes/{oq['id']}/design/ai", json={"description": "x y z", "reference_id": ref["id"]}, headers=other).status_code == 422
