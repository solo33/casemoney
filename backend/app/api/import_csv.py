"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.import_csv import ConfirmResponse
from app.operations.import_csv import commands
from app.schemas.import_csv_views import ConfirmRequest, PreviewResponseWithToken, TBankConfirmRequest


router = APIRouter(prefix="/api/import", tags=["import"])

@router.post("/preview", response_model=PreviewResponseWithToken)
async def preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return await commands.preview(file=file, db=db, user_id=user_id)


@router.post("/confirm", response_model=ConfirmResponse)
def confirm(
    data: ConfirmRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.confirm(data=data, db=db, user_id=user_id)


@router.post("/tbank/preview")
async def preview_tbank(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return await commands.preview_tbank(file=file, db=db, user_id=user_id)


@router.post("/tbank/confirm")
def confirm_tbank(
    data: TBankConfirmRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.confirm_tbank(data=data, db=db, user_id=user_id)
