"""Uploads that aren't attached to anything yet (e.g. a brochure picked while writing a new quote)."""

import base64

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import ai_art, designer, quote_art
from .. import schemas as s
from ..db import get_db
from ..models import User
from ..security import current_user

router = APIRouter(prefix="/media", tags=["media"])


@router.post("", response_model=s.MediaOut, status_code=201)
async def upload(file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = await quote_art.read_upload(db, user.business_id, file)
    db.commit()
    return s.MediaOut(id=a.id, name=a.filename or "file", content_type=a.content_type, is_pdf=a.content_type == "application/pdf")


@router.get("/ai", response_model=s.AiImageOut | None)
def ai_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """How many AI pictures are left this month (null when AI isn't set up)."""
    left = ai_art.left_this_month(db, user.business_id)
    return None if left is None else s.AiImageOut(id=0, preview="", ai_left=left)


@router.post("/ai", response_model=s.AiImageOut, status_code=201)
def ai_picture(body: s.AiImageIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """An AI picture from a description (and optionally a reference photo), before the quote is saved."""
    desc = (body.description or "").strip()
    if len(desc) < 3:
        raise HTTPException(422, "Describe the picture you want, e.g. \"bridal makeup set-up with soft flowers\".")
    ref = quote_art.reference(db, user.business_id, body.reference_id)
    try:
        a = ai_art.generate(db, user.business_id, None, designer.described_prompt(desc, bool(ref)), reference=ref)
    except ai_art.ArtError as e:
        raise HTTPException(409, str(e))
    db.commit()
    return s.AiImageOut(id=a.id, preview="data:image/jpeg;base64," + base64.b64encode(a.data).decode(),
                        ai_left=ai_art.left_this_month(db, user.business_id))
