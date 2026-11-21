"""Facebook / Instagram webhooks: comments, reactions and messages on campaign posts become leads (Meta is faked)."""

import hashlib
import hmac
import json

import httpx
import pytest

from app import creative, social
from app.config import get_settings
from app.db import SessionLocal
from app.models import Business, Customer, Lead, SocialEvent, SocialPerson

from .conftest import signup
from .test_social import GRAPH, FakeApis, _campaign, _connect


class MetaFake(FakeApis):
    def __init__(self):
        super().__init__()
        self.sent: list[dict] = []
        self.fail_send = False

    def __call__(self, req: httpx.Request) -> httpx.Response:
        p = req.url.path
        if req.url.host == "graph.test" and p.endswith("/subscribed_apps"):
            self.calls.append((req.method, p, {}))
            return httpx.Response(200, json={"success": True})
        if req.url.host == "graph.test" and p.endswith("/me/messages"):
            body = json.loads(req.content)
            body["token"] = req.url.params.get("access_token")
            self.sent.append(body)
            if self.fail_send:
                return httpx.Response(400, json={"error": {"message": "This message is sent outside of allowed window.", "code": 10}})
            rid = "PSID-" + (body["recipient"].get("comment_id") or body["recipient"].get("id"))
            return httpx.Response(200, json={"recipient_id": rid, "message_id": f"m{len(self.sent)}"})
        if req.url.host == "graph.test" and p.endswith("/DM1"):
            return httpx.Response(200, json={"name": "Noor Ali", "first_name": "Noor"})
        return super().__call__(req)


@pytest.fixture()
def meta(monkeypatch):
    st = get_settings()
    for k, v in {"meta_app_id": "app1", "meta_app_secret": "sec1", "meta_graph_url": GRAPH,
                 "meta_dialog_url": "https://dialog.test/oauth", "meta_webhook_verify_token": "brisk-verify"}.items():
        monkeypatch.setattr(st, k, v)
    fake = MetaFake()
    monkeypatch.setattr(social, "_client", httpx.Client(transport=httpx.MockTransport(fake)))
    monkeypatch.setattr(creative, "video", lambda c, url, seconds=8: b"\x00" * 2048)
    return fake


def hook(client, body, secret="sec1"):
    raw = json.dumps(body).encode()
    sig = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post("/api/social/webhook", content=raw, headers={"x-hub-signature-256": sig, "content-type": "application/json"})


def fb_comment(cid="C1", post="PAGE1_777", who=("U1", "Sara Khan"), text="How much for two people?"):
    return {"object": "page", "entry": [{"id": "PAGE1", "time": 1, "changes": [{"field": "feed", "value": {
        "item": "comment", "verb": "add", "comment_id": cid, "post_id": post, "message": text,
        "from": {"id": who[0], "name": who[1]}}}]}]}


def setup_posted(client, meta):
    h = signup(client)
    _connect(client, h, "meta")
    c = _campaign(client, h)
    client.post(f"/api/campaigns/{c['id']}/publish", json={"providers": ["facebook", "instagram"]}, headers=h)
    return h, c


def test_verify_and_signature(client, meta):
    r = client.get("/api/social/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "brisk-verify", "hub.challenge": "42"})
    assert r.status_code == 200 and r.text == "42"
    assert client.get("/api/social/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "no", "hub.challenge": "1"}).status_code == 403
    assert hook(client, fb_comment(), secret="wrong").status_code == 401


def test_connect_subscribes_pages_and_asks_for_comment_permissions(client, meta):
    h = signup(client)
    url, _ = _connect(client, h, "meta")
    assert "pages_manage_metadata" in url and "instagram_manage_comments" in url and "pages_messaging" in url
    assert {c[1] for c in meta.calls if c[1].endswith("subscribed_apps")} == {"/v21.0/PAGE1/subscribed_apps", "/v21.0/PAGE2/subscribed_apps"}


def test_facebook_comment_becomes_lead_with_private_reply_and_accept_joins_up(client, meta):
    h, c = setup_posted(client, meta)
    assert hook(client, fb_comment()).status_code == 200
    assert hook(client, fb_comment()).status_code == 200  # Meta retries: handled once

    leads = client.get("/api/leads", headers=h).json()
    assert len(leads) == 1
    lead = leads[0]
    assert lead["customer"]["name"] == "Sara Khan" and lead["source"] == "Facebook comment: Bridal glow"
    assert lead["channel"] == "facebook" and lead["last_message"] == "How much for two people?" and lead["unread"] == 1
    assert client.get("/api/leads/unread", headers=h).json() == {"count": 1}

    # The automatic private reply, through the Page, to the comment, with a personal offer link
    assert len(meta.sent) == 1
    sent = meta.sent[0]
    assert sent["recipient"] == {"comment_id": "C1"} and sent["token"] == "page-token-1"
    with SessionLocal() as db:
        p = db.query(SocialPerson).one()
        assert p.msg_id == "PSID-C1" and p.provider == "facebook"
        assert f"https://app.test/c/{c['token']}?via=facebook&p={p.token}" in sent["message"]["text"]
        assert "Hi Sara!" in sent["message"]["text"] and "Layla Beauty Lounge" in sent["message"]["text"]
        token = p.token

    chat = client.get(f"/api/leads/{lead['id']}/chat", headers=h).json()
    assert [(m["dir"], m["channel"], m.get("kind")) for m in chat["messages"]] == [("in", "facebook", None), ("out", "facebook", "private_reply")]
    assert chat["messages"][0]["note"] == "Comment on your campaign \"Bridal glow\""
    fb = chat["channels"][0]
    assert fb["channel"] == "facebook" and fb["can_reply"] is False  # the one private reply is used
    assert client.post(f"/api/leads/{lead['id']}/chat", json={"text": "Hi", "channel": "facebook"}, headers=h).status_code == 409

    camp = client.get(f"/api/campaigns/{c['id']}", headers=h).json()
    assert camp["comments"] == 1

    # She opens the link and accepts with her mobile: same client, same lead, now with the number
    r = client.post(f"/api/public/c/{c['token']}/accept", json={"name": "Sara K", "phone": "050 555 1234", "p": token})
    assert r.status_code == 201, r.text
    leads = client.get("/api/leads", headers=h).json()
    assert len(leads) == 1 and leads[0]["customer"]["phone"] and leads[0]["offer"] == "Bridal glow"
    assert "Offer page, from Facebook" in leads[0]["requirement"]
    with SessionLocal() as db:
        assert db.query(Customer).count() == 1


def test_accept_with_number_of_existing_client_merges(client, meta):
    h, c = setup_posted(client, meta)
    client.post("/api/customers", json={"name": "Sara Khan", "phone": "0505551234"}, headers=h)
    hook(client, fb_comment())
    with SessionLocal() as db:
        token = db.query(SocialPerson).one().token
    r = client.post(f"/api/public/c/{c['token']}/accept", json={"name": "Sara", "phone": "050 555 1234", "p": token})
    assert r.status_code == 201, r.text
    with SessionLocal() as db:
        assert db.query(Customer).count() == 1
        cu = db.query(Customer).one()
        assert db.query(SocialPerson).one().customer_id == cu.id
        assert db.query(Lead).count() == 1 and db.query(Lead).one().customer_id == cu.id


def test_instagram_comment_and_auto_reply_off(client, meta):
    h, c = setup_posted(client, meta)
    assert client.patch("/api/business", json={"social_auto_reply": False}, headers=h).json()["social_auto_reply"] is False
    body = {"object": "instagram", "entry": [{"id": "IG1", "time": 1, "changes": [{"field": "comments", "value": {
        "id": "IGC1", "text": "Price? 😍", "from": {"id": "IGU1", "username": "sara.k"}, "media": {"id": "igmedia1"}}}]}]}
    hook(client, body)
    lead = client.get("/api/leads", headers=h).json()[0]
    assert lead["customer"]["name"] == "@sara.k" and lead["source"] == "Instagram comment: Bridal glow" and lead["social"] == "@sara.k"
    assert meta.sent == []
    chat = client.get(f"/api/leads/{lead['id']}/chat", headers=h).json()
    ig = chat["channels"][0]
    assert ig["channel"] == "instagram" and ig["how"] == "comment" and ig["can_reply"]
    # The owner sends the private reply by hand
    r = client.post(f"/api/leads/{lead['id']}/chat", json={"text": "Hi Sara, it's AED 800", "channel": "instagram"}, headers=h)
    assert r.status_code == 200, r.text
    assert meta.sent[-1]["recipient"] == {"comment_id": "IGC1"}
    assert r.json()["channels"][0]["can_reply"] is False
    # The salon's own replies on its post are ignored
    own = {"object": "instagram", "entry": [{"id": "IG1", "changes": [{"field": "comments", "value": {
        "id": "IGC2", "text": "Thanks!", "from": {"id": "IG1", "username": "laylabeauty"}, "media": {"id": "igmedia1"}}}]}]}
    hook(client, own)
    with SessionLocal() as db:
        assert db.query(SocialEvent).filter_by(kind="comment").count() == 1


def test_reaction_on_campaign_counts_and_becomes_lead(client, meta):
    h, c = setup_posted(client, meta)
    like = {"object": "page", "entry": [{"id": "PAGE1", "changes": [{"field": "feed", "value": {
        "item": "reaction", "verb": "add", "reaction_type": "love", "post_id": "PAGE1_777", "from": {"id": "U9", "name": "Mona"}}}]}]}
    hook(client, like)
    hook(client, like)
    other = json.loads(json.dumps(like))
    other["entry"][0]["changes"][0]["value"]["post_id"] = "PAGE1_999"  # not a campaign
    hook(client, other)
    assert client.get(f"/api/campaigns/{c['id']}", headers=h).json()["reactions"] == 1
    leads = client.get("/api/leads", headers=h).json()
    assert len(leads) == 1 and leads[0]["source"] == "Facebook like: Bridal glow" and meta.sent == []


def test_messenger_dm_auto_reply_and_owner_reply(client, meta):
    h, c = setup_posted(client, meta)
    dm = {"object": "page", "entry": [{"id": "PAGE1", "time": 1, "messaging": [
        {"sender": {"id": "DM1"}, "recipient": {"id": "PAGE1"}, "message": {"mid": "mid1", "text": "Are you open Friday?"}}]}]}
    hook(client, dm)
    hook(client, dm)
    echo = {"object": "page", "entry": [{"id": "PAGE1", "messaging": [
        {"sender": {"id": "PAGE1"}, "recipient": {"id": "DM1"}, "message": {"mid": "mid2", "text": "Yes", "is_echo": True}}]}]}
    hook(client, echo)
    lead = client.get("/api/leads", headers=h).json()[0]
    assert lead["customer"]["name"] == "Noor Ali" and lead["source"] == "Facebook message"
    assert len(meta.sent) == 1 and meta.sent[0]["recipient"] == {"id": "DM1"} and "Thanks for contacting Layla Beauty Lounge" in meta.sent[0]["message"]["text"]

    chat = client.get(f"/api/leads/{lead['id']}/chat", headers=h).json()
    assert chat["channel"] == "facebook" and chat["channels"][0]["how"] == "dm" and chat["channels"][0]["can_reply"]
    r = client.post(f"/api/leads/{lead['id']}/chat", json={"text": "Yes, 10am to 10pm", "channel": "facebook"}, headers=h)
    assert r.status_code == 200
    assert meta.sent[-1] == {"recipient": {"id": "DM1"}, "message": {"text": "Yes, 10am to 10pm"}, "messaging_type": "RESPONSE", "token": "page-token-1"}
    assert [m["kind"] for m in r.json()["messages"] if m["dir"] == "out"] == ["auto_reply", "chat"]

    meta.fail_send = True
    r = client.post(f"/api/leads/{lead['id']}/chat", json={"text": "Again", "channel": "facebook"}, headers=h)
    assert r.status_code == 502 and "allowed window" in r.json()["detail"]


def test_unknown_page_is_ignored(client, meta):
    signup(client)
    assert hook(client, fb_comment()).status_code == 200
    with SessionLocal() as db:
        assert db.query(SocialEvent).count() == 0 and db.query(Business).count() == 1
