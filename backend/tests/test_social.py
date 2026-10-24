"""Connecting Facebook / Instagram / YouTube and posting campaigns (Meta and Google are faked)."""

import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app import creative, social
from app.config import get_settings
from app.db import SessionLocal
from app.models import SocialAccount

from .conftest import signup

GRAPH = "https://graph.test/v21.0"


class FakeApis:
    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.ig_error = False

    def __call__(self, req: httpx.Request) -> httpx.Response:
        u = req.url
        path = u.path
        q = dict(u.params)
        form = {k: v[0] for k, v in parse_qs(req.content.decode(errors="ignore")).items()} if req.method in ("POST",) and \
            req.headers.get("content-type", "").startswith("application/x-www-form-urlencoded") else {}
        self.calls.append((req.method, str(u.copy_with(query=None)), {**q, **form}))
        if u.host == "graph.test":
            if path.endswith("/oauth/access_token"):
                return httpx.Response(200, json={"access_token": "long-user" if "fb_exchange_token" in q else "short-user"})
            if path.endswith("/me/accounts"):
                assert q["access_token"] == "long-user"
                return httpx.Response(200, json={"data": [{
                    "id": "PAGE1", "name": "Layla Beauty Lounge", "access_token": "page-token-1",
                    "picture": {"data": {"url": "https://pic/p.jpg"}},
                    "instagram_business_account": {"id": "IG1", "username": "laylabeauty", "profile_picture_url": "https://pic/ig.jpg"},
                }, {"id": "PAGE2", "name": "Layla Nails", "access_token": "page-token-2"}]})
            if path.endswith("/PAGE1/photos"):
                return httpx.Response(200, json={"id": "photo1", "post_id": "PAGE1_777"})
            if path.endswith("/IG1/media"):
                if self.ig_error:
                    return httpx.Response(400, json={"error": {"message": "Error validating access token", "code": 190}})
                return httpx.Response(200, json={"id": "container1"})
            if path.endswith("/container1"):
                return httpx.Response(200, json={"status_code": "FINISHED", "id": "container1"})
            if path.endswith("/IG1/media_publish"):
                return httpx.Response(200, json={"id": "igmedia1"})
            if path.endswith("/igmedia1"):
                return httpx.Response(200, json={"permalink": "https://www.instagram.com/p/ABC123/"})
        if u.host == "oauth.test":
            if form.get("grant_type") == "authorization_code":
                return httpx.Response(200, json={"access_token": "g-access", "refresh_token": "g-refresh", "expires_in": 3599})
            if form.get("grant_type") == "refresh_token":
                assert form["refresh_token"] == "g-refresh"
                return httpx.Response(200, json={"access_token": "g-access-2", "expires_in": 3599})
        if u.host == "yt.test":
            if path.endswith("/channels"):
                return httpx.Response(200, json={"items": [{"id": "UC1", "snippet": {"title": "Layla Beauty", "customUrl": "@laylabeauty",
                                                                                     "thumbnails": {"default": {"url": "https://pic/yt.jpg"}}}}]})
            if req.method == "POST" and path.endswith("/videos"):
                meta = json.loads(req.content)
                self.calls[-1][2].update(meta=meta)
                return httpx.Response(200, headers={"location": "https://yt.test/upload/session1"})
            if req.method == "PUT" and path.endswith("/session1"):
                self.calls[-1][2].update(bytes=len(req.content))
                return httpx.Response(200, json={"id": "VID1"})
        return httpx.Response(404, json={"error": {"message": f"unexpected {req.method} {u}"}})


@pytest.fixture()
def apis(monkeypatch):
    st = get_settings()
    for k, v in {"meta_app_id": "app1", "meta_app_secret": "sec1", "meta_graph_url": GRAPH,
                 "meta_dialog_url": "https://dialog.test/oauth", "google_client_id": "gid", "google_client_secret": "gsec",
                 "google_auth_url": "https://accounts.test/auth", "google_token_url": "https://oauth.test/token",
                 "youtube_api_url": "https://yt.test/youtube/v3", "youtube_upload_url": "https://yt.test/upload/youtube/v3/videos"}.items():
        monkeypatch.setattr(st, k, v)
    fake = FakeApis()
    monkeypatch.setattr(social, "_client", httpx.Client(transport=httpx.MockTransport(fake)))
    monkeypatch.setattr(creative, "video", lambda c, url, seconds=8: b"\x00" * 2048)
    return fake


def _campaign(client, h):
    return client.post("/api/campaigns", json={"title": "Bridal glow", "description": "Hair & makeup on the day",
                                               "items": [{"description": "Bridal makeup", "unit_price": 800}]}, headers=h).json()


def _connect(client, h, login):
    url = client.post(f"/api/social/{login}/connect", headers=h).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    return url, client.get(f"/api/social/{login}/callback", params={"code": "c0de", "state": state}, follow_redirects=False)


def test_not_set_up_on_platform(client):
    h = signup(client)
    assert client.get("/api/social", headers=h).json() == {"meta_ready": False, "google_ready": False, "accounts": []}
    assert client.post("/api/social/meta/connect", headers=h).status_code == 409


def test_connect_and_post_everywhere(client, apis):
    h = signup(client)
    url, r = _connect(client, h, "meta")
    q = parse_qs(urlparse(url).query)
    assert url.startswith("https://dialog.test/oauth") and q["redirect_uri"] == ["https://app.test/api/social/meta/callback"]
    assert "instagram_content_publish" in q["scope"][0] and "pages_manage_posts" in q["scope"][0]
    assert r.status_code == 303 and r.headers["location"].startswith("https://app.test/settings?social=connected")

    url, r = _connect(client, h, "google")
    assert "youtube.upload" in parse_qs(urlparse(url).query)["scope"][0] and "access_type=offline" in url
    assert r.status_code == 303 and "social=connected" in r.headers["location"]

    st = client.get("/api/social", headers=h).json()
    got = {(a["provider"], a["name"], a["selected"]) for a in st["accounts"]}
    assert got == {("facebook", "Layla Beauty Lounge", True), ("facebook", "Layla Nails", False),
                   ("instagram", "laylabeauty", True), ("youtube", "Layla Beauty", True)}
    with SessionLocal() as db:  # tokens are stored encrypted
        tokens = [a.token_enc for a in db.query(SocialAccount).all()]
        assert all(t and "page-token" not in t and "g-access" not in t for t in tokens)

    c = _campaign(client, h)
    assert "Accept and book your time: https://app.test/c/" in c["post_caption"] and c["image_version"]
    r = client.post(f"/api/campaigns/{c['id']}/publish", json={"providers": ["facebook", "instagram", "youtube"]}, headers=h)
    assert r.status_code == 202 and [p["status"] for p in r.json()] == ["posting"] * 3

    posts = {p["provider"]: p for p in client.get(f"/api/campaigns/{c['id']}/posts", headers=h).json()}
    assert posts["facebook"]["status"] == "posted" and posts["facebook"]["url"] == "https://www.facebook.com/PAGE1_777"
    assert posts["instagram"]["status"] == "posted" and posts["instagram"]["url"] == "https://www.instagram.com/p/ABC123/"
    assert posts["youtube"]["status"] == "posted" and posts["youtube"]["url"] == "https://youtube.com/shorts/VID1"

    calls = {c_[1].rsplit("/", 1)[-1]: c_[2] for c_ in apis.calls}
    fb = calls["photos"]
    assert fb["access_token"] == "page-token-1" and f"/api/public/c/{c['token']}/image/portrait.jpg" in fb["url"]
    assert f"https://app.test/c/{c['token']}" in fb["caption"]
    ig = calls["media"]
    assert "Scan the code in the picture" in ig["caption"] and f"/c/{c['token']}" not in ig["caption"]
    yt = calls["videos"]["meta"]
    assert yt["snippet"]["title"].endswith("#Shorts") and yt["status"]["privacyStatus"] == "public"
    assert f"https://app.test/c/{c['token']}" in yt["snippet"]["description"] and calls["session1"]["bytes"] == 2048


def test_login_for_business_uses_configuration(client, apis, monkeypatch):
    monkeypatch.setattr(get_settings(), "meta_login_config_id", "987654")
    h = signup(client)
    url, r = _connect(client, h, "meta")
    q = parse_qs(urlparse(url).query)
    assert q["config_id"] == ["987654"] and "scope" not in q and "social=connected" in r.headers["location"]


def test_choose_other_page_and_custom_caption(client, apis):
    h = signup(client)
    _connect(client, h, "meta")
    nails = next(a for a in client.get("/api/social", headers=h).json()["accounts"] if a["name"] == "Layla Nails")
    st = client.post(f"/api/social/accounts/{nails['id']}/select", headers=h).json()
    assert [a["name"] for a in st["accounts"] if a["provider"] == "facebook" and a["selected"]] == ["Layla Nails"]
    c = _campaign(client, h)
    client.post(f"/api/campaigns/{c['id']}/publish", json={"providers": ["facebook"], "caption": "Eid special! Book now"}, headers=h)
    post = client.get(f"/api/campaigns/{c['id']}/posts", headers=h).json()[0]
    assert post["account_name"] == "Layla Nails" and post["status"] == "failed"  # the fake only knows PAGE1's endpoint
    assert any(call[2].get("caption") == "Eid special! Book now" and call[2].get("access_token") == "page-token-2" for call in apis.calls)


def test_revoked_instagram_asks_to_reconnect(client, apis):
    h = signup(client)
    _connect(client, h, "meta")
    apis.ig_error = True
    c = _campaign(client, h)
    client.post(f"/api/campaigns/{c['id']}/publish", json={"providers": ["instagram"]}, headers=h)
    post = client.get(f"/api/campaigns/{c['id']}/posts", headers=h).json()[0]
    assert post["status"] == "failed" and "access token" in post["error"]
    ig = next(a for a in client.get("/api/social", headers=h).json()["accounts"] if a["provider"] == "instagram")
    assert ig["error"].startswith("Reconnect")
    _connect(client, h, "meta")  # connecting again clears it
    ig = next(a for a in client.get("/api/social", headers=h).json()["accounts"] if a["provider"] == "instagram")
    assert ig["error"] is None


def test_guards(client, apis):
    h = signup(client)
    c = _campaign(client, h)
    r = client.post(f"/api/campaigns/{c['id']}/publish", json={"providers": ["youtube"]}, headers=h)
    assert r.status_code == 409 and "Connect Youtube" in r.json()["detail"]
    bad = client.get("/api/social/meta/callback", params={"code": "x", "state": "forged"}, follow_redirects=False)
    assert bad.status_code == 303 and "social=error" in bad.headers["location"]
    denied = client.get("/api/social/google/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert "social=error" in denied.headers["location"]
    # another salon can't post this campaign
    other = signup(client, email="x@other.ae", business="Other Salon")
    assert client.post(f"/api/campaigns/{c['id']}/publish", json={"providers": ["facebook"]}, headers=other).status_code == 404
    # disconnect
    _connect(client, h, "meta")
    assert client.delete("/api/social/meta", headers=h).json()["accounts"] == []


def test_public_picture(client):
    h = signup(client)
    c = _campaign(client, h)
    for fmt, size in creative.SIZES.items():
        r = client.get(f"/api/public/c/{c['token']}/image/{fmt}.jpg")
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        from io import BytesIO

        from PIL import Image
        assert Image.open(BytesIO(r.content)).size == size
    assert client.get(f"/api/public/c/{c['token']}/image/huge.jpg").status_code == 404
