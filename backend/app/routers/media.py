"""Uploads that aren't attached to anything yet (e.g. a brochure picked while writing a new quote)."""

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from .. import quote_art
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
