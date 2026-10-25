"""Campaign banners made from the package text: free designs, and the optional capped AI background."""

import io

import httpx
import pytest
from PIL import Image

from app import ai_art, designer
from app.config import get_settings

from .conftest import signup


def _campaign(client, h, title="Hydra-facial with Gold Mask", desc="Deep cleanse, hydration and glow",
              items=(("Hydrating facial", 450), ("Organic peel", 400), ("Skin brightening", 350))):
    return client.post("/api/campaigns", json={"title": title, "description": desc,
                                               "items": [{"description": d, "unit_price": p} for d, p in items]}, headers=h).json()


def _img(client, c, fmt="portrait"):
    r = client.get(f"/api/public/c/{c['token']}/image/{fmt}.jpg")
    assert r.status_code == 200
    return Image.open(io.BytesIO(r.content))


def test_theme_is_read_from_the_package(client):
    h = signup(client)
    assert _campaign(client, h)["theme"] == "Skin & facial"
    assert _campaign(client, h, "Bridal glow", "", (("Bridal makeup", 1800),))["theme"] == "Bridal"
    assert _campaign(client, h, "Eid special", "Gel manicure and pedicure", (("Gel mani", 90),))["theme"] == "Nails"
    assert _campaign(client, h, "Weekend treat", "", (("Something nice", 100),))["theme"] == "Beauty"


def test_free_styles_and_shuffle(client):
    h = signup(client)
    c = _campaign(client, h)
    assert c["design_style"] == "bold" and c["ai_left"] is None
    classic = client.get(f"/api/public/c/{c['token']}/image/portrait.jpg").content
    prev = c["image_version"]
    for style in ("classic", "soft", "bold"):
        c2 = client.patch(f"/api/campaigns/{c['id']}/design", json={"style": style}, headers=h).json()
        assert c2["design_style"] == style and c2["image_version"] != prev
        prev = c2["image_version"]
        for fmt, size in (("portrait", (1080, 1350)), ("square", (1080, 1080)), ("story", (1080, 1920))):
            assert _img(client, c, fmt).size == size
    before = client.get(f"/api/public/c/{c['token']}/image/portrait.jpg").content
    shuffled = client.patch(f"/api/campaigns/{c['id']}/design", json={"shuffle": True}, headers=h).json()
    after = client.get(f"/api/public/c/{c['token']}/image/portrait.jpg").content
    assert shuffled["image_version"] != c2["image_version"] and after != before
    assert client.patch(f"/api/campaigns/{c['id']}/design", json={"style": "photo"}, headers=h).status_code == 409


def test_real_estate_themes(client):
    r = client.post("/api/auth/signup", json={"business_name": "Marina Key", "name": "Omar", "email": "o@mk.ae",
                                              "password": "supersecret", "business_type": "real_estate"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert _campaign(client, h, "Sea-view 2BR at Marina Gate", "", (("2-bed apartment", 2450000),))["theme"] == "Sea view"
    assert _campaign(client, h, "4BR villa with garden", "", (("Villa, Arabian Ranches", 6900000),))["theme"] == "Villa"
    c = _campaign(client, h, "1BR for rent in JLT", "Yearly, 4 cheques", (("Annual rent", 85000),))
    assert c["theme"] == "For rent"
    client.patch(f"/api/campaigns/{c['id']}/design", json={"style": "bold"}, headers=h)
    assert _img(client, c).size == (1080, 1350)


@pytest.fixture()
def fal(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "ai_image_key", "fal-key")
    monkeypatch.setattr(st, "ai_image_provider", "fal")
    monkeypatch.setattr(st, "ai_images_per_month", 2)
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        if req.url.host == "fal.run":
            assert req.headers["authorization"] == "Key fal-key"
            return httpx.Response(200, json={"images": [{"url": "https://cdn.fal.test/pic.png"}]})
        buf = io.BytesIO()
        Image.new("RGB", (768, 1344), (120, 160, 150)).save(buf, "PNG")
        return httpx.Response(200, content=buf.getvalue())

    monkeypatch.setattr(ai_art, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    return calls


def test_ai_background_is_capped_and_reused(client, fal):
    import json

    h = signup(client)
    c = _campaign(client, h)
    assert c["ai_left"] == 2
    r = client.post(f"/api/campaigns/{c['id']}/design/ai", headers=h)
    assert r.status_code == 200, r.text
    c2 = r.json()
    assert c2["design_style"] == "photo" and c2["has_ai_art"] and c2["ai_left"] == 1
    prompt = json.loads(fal[0].content)["prompt"]
    assert "facial" in prompt and "No text" in prompt
    for fmt in ("portrait", "square", "story"):
        _img(client, c, fmt)  # every size reuses the same stored picture: no new calls
    assert len(fal) == 2  # one generate + one download
    client.post(f"/api/campaigns/{c['id']}/design/ai", headers=h)
    capped = client.post(f"/api/campaigns/{c['id']}/design/ai", headers=h)
    assert capped.status_code == 409 and "this month" in capped.json()["detail"]
    # switch back to a free style and back to the photo without paying again
    client.patch(f"/api/campaigns/{c['id']}/design", json={"style": "soft"}, headers=h)
    assert client.patch(f"/api/campaigns/{c['id']}/design", json={"style": "photo"}, headers=h).json()["design_style"] == "photo"


def test_prompt_never_asks_for_text():
    class B: business_type = "unisex"; name = "X"; currency = "AED"  # noqa: E702
    class I: description = "Bridal makeup <script>"  # noqa: E701
    class C: title = "Bridal glow!!"; description = ""; items = [I()]; business = B()  # noqa: E702
    p = designer.ai_prompt(C())
    assert "bridal" in p.lower() and "<" not in p and "No text" in p
