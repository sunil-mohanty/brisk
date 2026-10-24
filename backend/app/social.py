"""Each salon connects its own Facebook Page, Instagram account and YouTube channel, and posts campaigns to them.

  Facebook + Instagram  one Meta login (Facebook Login). We keep each Page's token (it doesn't expire) and the
                        Instagram professional account linked to the Page.
  YouTube               Google login with the youtube.upload scope. We keep the refresh token.

Posting:
  Facebook   photo post (the portrait picture) with the caption; links in the caption are clickable.
  Instagram  feed post (the portrait picture). Links in Instagram captions aren't clickable, so the picture
             carries a QR code and the caption says to scan it.
  YouTube    an 8-second vertical video (a Short) with the offer link in the description.
"""

import base64
import hashlib
import logging
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import creative
from .config import get_settings
from .models import Campaign, CampaignPost, SocialAccount
from .utils import quote_totals

log = logging.getLogger("salon.social")

META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management",
               "instagram_basic", "instagram_content_publish"]
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]
PROVIDERS = ("facebook", "instagram", "youtube")
LOGIN_FOR = {"facebook": "meta", "instagram": "meta", "youtube": "google"}

_client: httpx.Client | None = None


def client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=120)
    return _client


class SocialError(Exception):
    def __init__(self, message: str, reconnect: bool = False):
        super().__init__(message)
        self.reconnect = reconnect


# ---------- settings ----------
def meta_ready() -> bool:
    s = get_settings()
    return bool(s.meta_app_id and s.meta_app_secret)


def google_ready() -> bool:
    s = get_settings()
    return bool(s.google_client_id and s.google_client_secret)


def ready(login: str) -> bool:
    return meta_ready() if login == "meta" else google_ready()


def redirect_uri(login: str) -> str:
    # Goes through the web domain, which forwards /api/* to the api service.
    return f"{get_settings().app_url.rstrip('/')}/api/social/{login}/callback"


# ---------- tokens at rest ----------
def _fernet() -> Fernet:
    key = hashlib.sha256((get_settings().jwt_secret + ":social-tokens").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def seal(v: str | None) -> str | None:
    return _fernet().encrypt(v.encode()).decode() if v else None


def unseal(v: str | None) -> str | None:
    if not v:
        return None
    try:
        return _fernet().decrypt(v.encode()).decode()
    except InvalidToken:
        raise SocialError("Reconnect this account (the app's secret changed).", reconnect=True)


# ---------- connecting ----------
def make_state(business_id: int, user_id: int, login: str) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=20)
    return jwt.encode({"b": business_id, "u": user_id, "p": login, "k": "social", "exp": exp}, s.jwt_secret, algorithm="HS256")


def read_state(state: str, login: str) -> int:
    try:
        data = jwt.decode(state, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise SocialError("The connection link expired. Please try again.")
    if data.get("k") != "social" or data.get("p") != login:
        raise SocialError("The connection link is not valid. Please try again.")
    return int(data["b"])


def login_url(login: str, state: str) -> str:
    s = get_settings()
    if login == "meta":
        return s.meta_dialog_url + "?" + urlencode({
            "client_id": s.meta_app_id, "redirect_uri": redirect_uri("meta"), "state": state,
            "scope": ",".join(META_SCOPES), "response_type": "code",
        })
    return s.google_auth_url + "?" + urlencode({
        "client_id": s.google_client_id, "redirect_uri": redirect_uri("google"), "state": state,
        "scope": " ".join(GOOGLE_SCOPES), "response_type": "code", "access_type": "offline",
        "prompt": "consent", "include_granted_scopes": "true",
    })


def _json(r: httpx.Response) -> dict:
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.status_code >= 400:
        err = data.get("error") if isinstance(data, dict) else None
        if isinstance(err, dict):  # Meta / Google API errors
            msg = err.get("error_user_msg") or err.get("message") or str(err)
            code = err.get("code")
            raise SocialError(f"{msg}"[:400], reconnect=code in (190, 401) or r.status_code == 401)
        msg = (data.get("error_description") or err or r.text[:300]) if isinstance(data, dict) else r.text[:300]
        raise SocialError(str(msg)[:400], reconnect=r.status_code == 401 or err == "invalid_grant")
    return data


def _upsert(db: Session, business_id: int, provider: str, account_id: str, **fields) -> SocialAccount:
    a = db.scalar(select(SocialAccount).where(SocialAccount.business_id == business_id, SocialAccount.provider == provider,
                                              SocialAccount.account_id == account_id))
    if not a:
        a = SocialAccount(business_id=business_id, provider=provider, account_id=account_id, token_enc="")
        db.add(a)
    for k, v in fields.items():
        setattr(a, k, v)
    a.error = None
    a.connected_at = datetime.now(timezone.utc)
    return a


def _select_default(db: Session, business_id: int) -> None:
    db.flush()
    for p in PROVIDERS:
        rows = db.scalars(select(SocialAccount).where(SocialAccount.business_id == business_id, SocialAccount.provider == p)
                          .order_by(SocialAccount.id)).all()
        if rows and not any(r.selected for r in rows):
            rows[0].selected = True


def finish_meta(db: Session, business_id: int, code: str) -> int:
    s = get_settings()
    g = s.meta_graph_url.rstrip("/")
    short = _json(client().get(f"{g}/oauth/access_token", params={
        "client_id": s.meta_app_id, "client_secret": s.meta_app_secret, "redirect_uri": redirect_uri("meta"), "code": code}))
    long = _json(client().get(f"{g}/oauth/access_token", params={
        "grant_type": "fb_exchange_token", "client_id": s.meta_app_id, "client_secret": s.meta_app_secret,
        "fb_exchange_token": short["access_token"]}))
    pages = _json(client().get(f"{g}/me/accounts", params={
        "access_token": long["access_token"], "limit": 50,
        "fields": "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}"}))
    n = 0
    for p in pages.get("data") or []:
        if not p.get("access_token"):
            continue
        token = seal(p["access_token"])
        _upsert(db, business_id, "facebook", p["id"], name=p.get("name") or "Facebook Page", handle=None,
                picture_url=((p.get("picture") or {}).get("data") or {}).get("url"), token_enc=token)
        n += 1
        ig = p.get("instagram_business_account")
        if ig and ig.get("id"):
            _upsert(db, business_id, "instagram", ig["id"], name=ig.get("name") or ig.get("username") or "Instagram",
                    handle=ig.get("username"), picture_url=ig.get("profile_picture_url"), token_enc=token)
            n += 1
    if not n:
        raise SocialError("No Facebook Page was shared. Connect again and tick your salon's Page (and its Instagram).")
    _select_default(db, business_id)
    return n


def finish_google(db: Session, business_id: int, code: str) -> int:
    s = get_settings()
    tok = _json(client().post(s.google_token_url, data={
        "code": code, "client_id": s.google_client_id, "client_secret": s.google_client_secret,
        "redirect_uri": redirect_uri("google"), "grant_type": "authorization_code"}))
    if not tok.get("refresh_token"):
        raise SocialError("Google didn't give permanent access. Remove the app from your Google account's "
                          "third-party access and connect again.")
    ch = _json(client().get(f"{s.youtube_api_url.rstrip('/')}/channels", params={"part": "snippet", "mine": "true"},
                            headers={"Authorization": f"Bearer {tok['access_token']}"}))
    items = ch.get("items") or []
    if not items:
        raise SocialError("This Google account has no YouTube channel. Create one on YouTube, then connect again.")
    sn = items[0].get("snippet") or {}
    _upsert(db, business_id, "youtube", items[0]["id"], name=sn.get("title") or "YouTube channel", handle=sn.get("customUrl"),
            picture_url=((sn.get("thumbnails") or {}).get("default") or {}).get("url"),
            token_enc=seal(tok["access_token"]), refresh_enc=seal(tok["refresh_token"]))
    _select_default(db, business_id)
    return 1


# ---------- captions ----------
def default_caption(c: Campaign, url: str) -> str:
    b = c.business
    t = quote_totals(c.items, c.discount, c.vat_rate)
    price = creative._money(t.total, b.currency)
    lines = [f"✨ {c.title} at {b.name}"]
    if c.description:
        lines.append(c.description.strip())
    elif c.items:
        lines.append(" + ".join(i.description for i in c.items[:5]))
    tail = f"{price}" + (f" (was {creative._money(t.subtotal * (1 + c.vat_rate / 100), b.currency)})" if t.discount > 0 else "")
    if c.valid_until:
        tail += f" · offer ends {c.valid_until:%d %b}".replace(" 0", " ")
    lines += ["", tail, "", f"Accept and book your time: {url}"]
    tag = "".join(ch for ch in b.name.title() if ch.isalnum())
    lines += ["", f"#{tag} #salon #dubai #beauty" if tag else "#salon #dubai #beauty"]
    return "\n".join(lines)


def caption_for(provider: str, caption: str, url: str) -> str:
    if provider == "instagram":
        # Instagram doesn't make links clickable: point to the QR code in the picture instead.
        caption = caption.replace(f"Accept and book your time: {url}", "Scan the code in the picture to accept and book your time 📲")
        if "Scan the code" not in caption:
            caption += "\n\nScan the code in the picture to accept and book your time 📲"
    return caption[:2200]


# ---------- posting ----------
def _image_url(c: Campaign, fmt: str) -> str:
    return f"{get_settings().app_url.rstrip('/')}/api/public/c/{c.token}/image/{fmt}.jpg?v={creative.version(c)}"


def _post_facebook(a: SocialAccount, c: Campaign, caption: str) -> tuple[str, str]:
    g = get_settings().meta_graph_url.rstrip("/")
    r = _json(client().post(f"{g}/{a.account_id}/photos", data={
        "url": _image_url(c, "portrait"), "caption": caption, "published": "true", "access_token": unseal(a.token_enc)}))
    pid = r.get("post_id") or r.get("id")
    return pid, f"https://www.facebook.com/{pid}"


def _post_instagram(a: SocialAccount, c: Campaign, caption: str, wait: float = 2.0) -> tuple[str, str]:
    g = get_settings().meta_graph_url.rstrip("/")
    token = unseal(a.token_enc)
    box = _json(client().post(f"{g}/{a.account_id}/media", data={
        "image_url": _image_url(c, "portrait"), "caption": caption, "access_token": token}))
    for _ in range(10):  # Instagram fetches and processes the picture first
        st = _json(client().get(f"{g}/{box['id']}", params={"fields": "status_code", "access_token": token}))
        if st.get("status_code") in (None, "FINISHED"):
            break
        if st.get("status_code") == "ERROR":
            raise SocialError("Instagram couldn't use the picture. Check the web address is public and try again.")
        time.sleep(wait)
    done = _json(client().post(f"{g}/{a.account_id}/media_publish", data={"creation_id": box["id"], "access_token": token}))
    link = _json(client().get(f"{g}/{done['id']}", params={"fields": "permalink", "access_token": token}))
    return done["id"], link.get("permalink") or f"https://www.instagram.com/{a.handle or ''}"


def _google_access(a: SocialAccount) -> str:
    s = get_settings()
    tok = _json(client().post(s.google_token_url, data={
        "client_id": s.google_client_id, "client_secret": s.google_client_secret,
        "refresh_token": unseal(a.refresh_enc), "grant_type": "refresh_token"}))
    return tok["access_token"]


def _post_youtube(a: SocialAccount, c: Campaign, caption: str, url: str) -> tuple[str, str]:
    s = get_settings()
    token = _google_access(a)
    mp4 = creative.video(c, url)
    title = f"{c.title} at {c.business.name}"[:90] + " #Shorts"
    meta = {
        "snippet": {"title": title, "description": caption[:4900], "categoryId": "26",
                    "tags": ["salon", "beauty", "dubai", "offer", c.business.name][:10]},
        "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
    }
    start = client().post(s.youtube_upload_url, params={"uploadType": "resumable", "part": "snippet,status"}, json=meta, headers={
        "Authorization": f"Bearer {token}", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(len(mp4))})
    _json(start)
    loc = start.headers.get("location")
    if not loc:
        raise SocialError("YouTube didn't accept the upload. Try again in a minute.")
    done = _json(client().put(loc, content=mp4, headers={"Authorization": f"Bearer {token}", "Content-Type": "video/mp4"}))
    return done["id"], f"https://youtube.com/shorts/{done['id']}"


def publish(db: Session, post: CampaignPost, account: SocialAccount, c: Campaign, url: str) -> None:
    """Posts it and records the result. Never raises: errors are kept on the post for the owner to see."""
    try:
        if account.provider == "facebook":
            rid, link = _post_facebook(account, c, post.caption)
        elif account.provider == "instagram":
            rid, link = _post_instagram(account, c, post.caption)
        else:
            rid, link = _post_youtube(account, c, post.caption, url)
        post.status, post.remote_id, post.url, post.posted_at = "posted", rid, link, datetime.now(timezone.utc)
    except SocialError as e:
        post.status, post.error = "failed", str(e)[:500]
        if e.reconnect:
            account.error = "Reconnect this account: access was removed or expired."
    except Exception as e:  # noqa: BLE001 - network errors, ffmpeg…
        log.exception("Posting campaign %s to %s failed", c.id, account.provider)
        post.status, post.error = "failed", f"Couldn't reach {account.provider.title()}: {e}"[:500]
