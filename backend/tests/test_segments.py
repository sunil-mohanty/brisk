"""Client segments made from the owner's own tags, and sending a campaign to a segment on WhatsApp."""

from urllib.parse import unquote

from .conftest import signup


def _client(client, h, name, phone):
    return client.post("/api/customers", json={"name": name, "phone": phone}, headers=h).json()


def _cats(client, h, *names):
    return client.put("/api/customers/categories", json={"categories": [{"name": n} for n in names]}, headers=h)


def test_owner_defines_up_to_four_categories(client):
    h = signup(client)
    a = _client(client, h, "Sara Ali", "0501112233")
    assert client.get("/api/customers/categories", headers=h).json() == {"categories": [], "uncategorised": 1, "max": 4}
    assert _cats(client, h, "A", "B", "C", "D", "E").status_code == 422
    assert _cats(client, h, "Bridal", "bridal").status_code == 422
    assert _cats(client, h, "Bridal", " ").status_code == 422
    assert client.put(f"/api/customers/{a['id']}/tags", json={"tags": ["Bridal"]}, headers=h).status_code == 422  # not a category yet
    _cats(client, h, "Bridal", "VIP")
    client.put(f"/api/customers/{a['id']}/tags", json={"tags": ["bridal", "VIP"]}, headers=h)
    # rename keeps the clients; removing a category takes it off its clients
    out = client.put("/api/customers/categories", json={"categories": [{"name": "Brides", "was": "Bridal"}, {"name": "Corporate"}]}, headers=h).json()
    assert out["categories"] == [{"name": "Brides", "count": 1}, {"name": "Corporate", "count": 0}] and out["uncategorised"] == 0
    assert client.get("/api/customers?tag=Brides", headers=h).json()[0]["tags"] == ["Brides"]


def test_import_into_a_category_and_sort_imported_clients_later(client):
    h = signup(client)
    _cats(client, h, "Bridal", "VIP")
    old = _client(client, h, "Sara Ali", "0501112233")
    rows = [{"name": "Sara Ali", "phone": "0501112233"}, {"name": "Mona", "phone": "0502223344"}]
    r = client.post("/api/customers/import", json={"rows": rows, "category": "bridal"}, headers=h).json()
    assert r["created"] == 1
    assert {c["name"] for c in client.get("/api/customers?tag=Bridal", headers=h).json()} == {"Sara Ali", "Mona"}  # existing client joins too
    assert client.post("/api/customers/import", json={"rows": rows, "category": "Nope"}, headers=h).status_code == 422
    # a plain import, then sort them afterwards: "No category" lists them, then put all of them in a category
    client.post("/api/customers/import", json={"rows": [{"name": f"P{i}", "phone": f"05555500{i:02d}"} for i in range(30)]}, headers=h)
    none = client.get("/api/customers?uncategorised=true", headers=h).json()
    assert len(none) == 30 and old["id"] not in {c["id"] for c in none}
    out = client.post("/api/customers/tags/bulk", json={"customer_ids": [c["id"] for c in none], "add": "VIP"}, headers=h).json()
    assert out["uncategorised"] == 0 and out["categories"][1] == {"name": "VIP", "count": 30}


def test_tags_filter_and_counts(client):
    h = signup(client)
    _cats(client, h, "Bridal", "VIP")
    a = _client(client, h, "Sara Ali", "0501112233")
    b = _client(client, h, "Mona Haddad", "0502223344")
    c = _client(client, h, "Lina Khan", "0503334455")
    assert a["tags"] == []
    r = client.put(f"/api/customers/{a['id']}/tags", json={"tags": [" Bridal ", "VIP", "bridal", ""]}, headers=h).json()
    assert r["tags"] == ["Bridal", "VIP"]
    counts = client.post("/api/customers/tags/bulk", json={"customer_ids": [b["id"], c["id"]], "add": "Bridal"}, headers=h).json()
    assert counts["categories"][0] == {"name": "Bridal", "count": 3}
    assert {x["name"] for x in client.get("/api/customers?tag=bridal", headers=h).json()} == {"Sara Ali", "Mona Haddad", "Lina Khan"}
    assert [x["name"] for x in client.get("/api/customers?tag=VIP", headers=h).json()] == ["Sara Ali"]
    client.post("/api/customers/tags/bulk", json={"customer_ids": [c["id"]], "remove": "BRIDAL"}, headers=h)
    assert client.get("/api/customers/categories", headers=h).json()["categories"] == [{"name": "Bridal", "count": 2}, {"name": "VIP", "count": 1}]
    # editing a client's details keeps their tags
    client.patch(f"/api/customers/{a['id']}", json={"name": "Sara A.", "phone": "0501112233"}, headers=h)
    assert client.get("/api/customers?tag=VIP", headers=h).json()[0]["tags"] == ["Bridal", "VIP"]
    # another business can't tag these clients
    other = signup(client, email="o@o.ae", business="Other")
    _cats(client, other, "Hacked")
    assert client.put(f"/api/customers/{a['id']}/tags", json={"tags": ["Hacked"]}, headers=other).status_code == 404
    client.post("/api/customers/tags/bulk", json={"customer_ids": [a["id"]], "add": "Hacked"}, headers=other)
    assert "Hacked" not in client.get("/api/customers?tag=VIP", headers=h).json()[0]["tags"]


def test_send_campaign_to_a_segment(client):
    h = signup(client)
    a = _client(client, h, "Sara Ali", "0501112233")
    b = _client(client, h, "Mona Haddad", None)
    _client(client, h, "Lina Khan", "0503334455")
    _cats(client, h, "Bridal")
    client.post("/api/customers/tags/bulk", json={"customer_ids": [a["id"], b["id"]], "add": "Bridal"}, headers=h)
    camp = client.post("/api/campaigns", json={"title": "Bridal glow package", "items": [{"description": "Bridal makeup", "unit_price": 1500}]}, headers=h).json()
    aud = client.get(f"/api/campaigns/{camp['id']}/audience?tag=Bridal", headers=h).json()
    assert [r["name"] for r in aud["rows"]] == ["Mona Haddad", "Sara Ali"] and aud["sent"] == 0
    sara = next(r for r in aud["rows"] if r["name"] == "Sara Ali")
    assert sara["whatsapp_url"].startswith("https://wa.me/971501112233?text=")
    text = unquote(sara["whatsapp_url"].split("text=")[1])
    assert text.startswith("Hi Sara! Bridal glow package") and camp["public_url"] in text
    assert next(r for r in aud["rows"] if r["name"] == "Mona Haddad")["whatsapp_url"] is None  # no number
    assert len(client.get(f"/api/campaigns/{camp['id']}/audience", headers=h).json()["rows"]) == 3  # everyone
    assert client.post(f"/api/campaigns/{camp['id']}/audience/{a['id']}/sent", headers=h).status_code == 204
    client.post(f"/api/campaigns/{camp['id']}/audience/{a['id']}/sent", headers=h)  # twice is fine
    aud = client.get(f"/api/campaigns/{camp['id']}/audience?tag=Bridal", headers=h).json()
    assert aud["sent"] == 1 and client.get(f"/api/campaigns/{camp['id']}", headers=h).json()["sent_whatsapp"] == 1
    client.delete(f"/api/campaigns/{camp['id']}/audience/{a['id']}/sent", headers=h)
    assert client.get(f"/api/campaigns/{camp['id']}/audience?tag=Bridal", headers=h).json()["sent"] == 0
    other = signup(client, email="o@o.ae", business="Other")
    assert client.get(f"/api/campaigns/{camp['id']}/audience", headers=other).status_code == 404
