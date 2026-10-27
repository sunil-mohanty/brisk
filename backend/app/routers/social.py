"""Connecting a salon's Facebook Page, Instagram and YouTube channel, and posting campaigns to them."""

from datetime import datetime, timezone
from urllib.parse import quote as urlquote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as s
from .. import social
from ..activity import record
from ..config import get_settings
from ..db import SessionLocal, get_db
from ..logic import get_owned
from ..models import Campaign, CampaignPost, SocialAccount, User
from ..security import require_manager
from .campaigns import campaign_expired, campaign_url

router = APIRouter(tags=["social"])


def _accounts(db: Session, business_id: int) -> list[SocialAccount]:
    return list(db.scalars(select(SocialAccount).where(SocialAccount.business_id == business_id)
                           .order_by(SocialAccount.provider, SocialAccount.id)))


@router.get("/social", response_model=s.SocialStatus)
def status(user: User = Depends(require_manager), db: Session = Depends(get_db)):
    return s.SocialStatus(meta_ready=social.meta_ready(), google_ready=social.google_ready(),
                          accounts=[s.SocialAccountOut.model_validate(a) for a in _accounts(db, user.business_id)])


@router.post("/social/{login}/connect", response_model=s.ConnectOut)
def connect(login: str, user: User = Depends(require_manager)):
    if login not in ("meta", "google"):
        raise HTTPException(404, "Unknown service")
    if not social.ready(login):
        raise HTTPException(409, "This isn't set up on the platform yet. Ask the platform owner to add the "
                                 f"{'Meta app' if login == 'meta' else 'Google project'} keys.")
    return s.ConnectOut(url=social.login_url(login, social.make_state(user.business_id, user.id, login)))


@router.get("/social/{login}/callback")
def callback(login: str, code: str | None = None, state: str | None = None, error: str | None = None,
             error_description: str | None = None, db: Session = Depends(get_db)):
    """Meta / Google send the browser back here after the owner allows access."""
    back = f"{get_settings().app_url.rstrip('/')}/settings"
    if login not in ("meta", "google"):
        raise HTTPException(404, "Unknown service")
    try:
        if error or not code or not state:
            raise social.SocialError(error_description or "Access wasn't given, so nothing was connected.")
        business_id = social.read_state(state, login)
        n = social.finish_meta(db, business_id, code) if login == "meta" else social.finish_google(db, business_id, code)
        record(db, business_id, "social_connected", login)
        db.commit()
        return RedirectResponse(f"{back}?social=connected&n={n}#social", status_code=303)
    except social.SocialError as e:
        db.rollback()
        return RedirectResponse(f"{back}?social=error&msg={urlquote(str(e)[:300])}#social", status_code=303)


@router.post("/social/accounts/{aid}/select", response_model=s.SocialStatus)
def choose(aid: int, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    """If the owner manages several Pages, which one campaigns go to."""
    a = get_owned(db, SocialAccount, aid, user.business_id, "Account")
    for other in _accounts(db, user.business_id):
        if other.provider == a.provider:
            other.selected = other.id == a.id
    db.commit()
    return status(user, db)


@router.delete("/social/{login}", response_model=s.SocialStatus)
def disconnect(login: str, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    providers = ("facebook", "instagram") if login == "meta" else ("youtube",)
    for a in _accounts(db, user.business_id):
        if a.provider in providers:
            db.delete(a)
    db.commit()
    return status(user, db)


# ---------- posting a campaign ----------
def _run(post_ids: list[int]) -> None:
    with SessionLocal() as db:
        for pid in post_ids:
            post = db.get(CampaignPost, pid)
            c = db.get(Campaign, post.campaign_id)
            acc = db.scalar(select(SocialAccount).where(SocialAccount.business_id == post.business_id,
                                                        SocialAccount.provider == post.provider, SocialAccount.selected.is_(True)))
            if not acc:
                post.status, post.error = "failed", "The account was disconnected."
            else:
                social.publish(db, post, acc, c, campaign_url(c))
            db.commit()


@router.post("/campaigns/{cid}/publish", response_model=list[s.CampaignPostOut], status_code=202)
def publish(cid: int, body: s.PublishIn, tasks: BackgroundTasks, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    c = get_owned(db, Campaign, cid, user.business_id, "Campaign")
    if not c.active or campaign_expired(c):
        raise HTTPException(409, "This campaign is paused or has ended. Switch it on before posting.")
    url = campaign_url(c)
    base = (body.caption or "").strip() or social.default_caption(c, url)
    accounts = {a.provider: a for a in _accounts(db, user.business_id) if a.selected}
    posts = []
    for p in dict.fromkeys(body.providers):
        if p not in social.PROVIDERS:
            raise HTTPException(422, f"Unknown platform: {p}")
        a = accounts.get(p)
        if not a:
            raise HTTPException(409, f"Connect {p.title()} in Settings first.")
        post = CampaignPost(campaign_id=c.id, business_id=c.business_id, provider=p, account_name=a.handle or a.name,
                            status="posting", caption=social.caption_for(p, base, url))
        db.add(post)
        posts.append(post)
    record(db, c.business_id, "campaign_posted", ",".join(body.providers))
    db.commit()
    tasks.add_task(_run, [p.id for p in posts])
    return [s.CampaignPostOut.model_validate(p) for p in posts]


@router.get("/campaigns/{cid}/posts", response_model=list[s.CampaignPostOut])
def posts(cid: int, user: User = Depends(require_manager), db: Session = Depends(get_db)):
    get_owned(db, Campaign, cid, user.business_id, "Campaign")
    rows = db.scalars(select(CampaignPost).where(CampaignPost.campaign_id == cid).order_by(CampaignPost.id.desc())).all()
    return [s.CampaignPostOut.model_validate(p) for p in rows]
