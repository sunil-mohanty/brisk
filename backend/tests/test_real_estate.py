"""Real estate brokers: their own kind of business, theme and words, on the same features."""

from .conftest import signup


def _broker(client):
    r = client.post("/api/auth/signup", json={"business_name": "Marina Key Properties", "name": "Omar", "email": "omar@marinakey.ae",
                                              "password": "supersecret", "phone": "050 700 1122", "business_type": "real_estate"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_signup_as_real_estate(client):
    h = _broker(client)
    biz = client.get("/api/me", headers=h).json()["business"]
    assert biz["business_type"] == "real_estate"
    salon = signup(client, email="x@salon.ae", business="Glow Salon")
    assert client.get("/api/me", headers=salon).json()["business"]["business_type"] == "unisex"


def test_public_pages_know_the_kind_of_business(client):
    h = _broker(client)
    c = client.post("/api/campaigns", json={"title": "Sea-view 2BR at Marina Gate", "vat_rate": 0,
                                            "items": [{"description": "2-bed apartment, Marina Gate 1", "unit_price": 2450000}]}, headers=h).json()
    pub = client.get(f"/api/public/c/{c['token']}").json()
    assert pub["business"]["vertical"] == "real_estate"
    assert "Book a viewing: https://app.test/c/" in c["post_caption"] and "#dubairealestate" in c["post_caption"]
    img = client.get(f"/api/public/c/{c['token']}/image/portrait.jpg")
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"

    salon = signup(client, email="x@salon.ae", business="Glow Salon")
    s = client.post("/api/campaigns", json={"title": "Eid glow", "items": [{"description": "Facial", "unit_price": 250}]}, headers=salon).json()
    assert client.get(f"/api/public/c/{s['token']}").json()["business"]["vertical"] == "salon"
    assert "Accept and book your time" in s["post_caption"]


def test_spelling_variants_and_unknown_kinds(client):
    from app.schemas import clean_business_type, vertical_of

    assert clean_business_type("Real Estate") == "real_estate" and vertical_of("real_estate") == "real_estate"
    assert clean_business_type("bakery") == "unisex" and vertical_of("ladies") == "salon"
