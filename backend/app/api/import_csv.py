"""Import transactions from CSV/XLSX/XLS files.

Two-step flow:
1) POST /api/import/preview uploads and scans a file, then returns preview + token.
2) POST /api/import/confirm takes the token and creates accounts, categories,
   currencies, and transactions.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
import time

from app.database import get_db
from app.services.auth import decode_token
from app.services import import_csv as svc
from app.schemas.import_csv import PreviewResponse, ConfirmResponse, ImportTotals

router = APIRouter(prefix="/api/import", tags=["import"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


# Простой in-memory кэш preview по токену.
# Ключ: import_token, значение: (user_id, rows, created_at).
# TTL — 30 минут.
_PREVIEW_CACHE: dict[str, tuple[int, list, float]] = {}
PREVIEW_TTL = 30 * 60
MAX_IMPORT_BYTES = 10 * 1024 * 1024


def _cleanup_cache():
    now = time.time()
    expired = [k for k, (_, _, t) in _PREVIEW_CACHE.items() if now - t > PREVIEW_TTL]
    for k in expired:
        _PREVIEW_CACHE.pop(k, None)


class PreviewResponseWithToken(PreviewResponse):
    import_token: str


@router.post("/preview", response_model=PreviewResponseWithToken)
async def preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой. Максимум 10 МБ.")
    try:
        rows = svc.parse_file(file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not rows:
        raise HTTPException(status_code=400, detail="Файл пустой или не содержит данных")

    preview = svc.build_preview(db, user_id, rows)

    _cleanup_cache()
    token = uuid.uuid4().hex
    _PREVIEW_CACHE[token] = (user_id, rows, time.time())

    return PreviewResponseWithToken(
        import_token=token,
        rows=[
            {
                "line_no": r.line_no,
                "date": r.date,
                "account": r.account,
                "category_path": r.category_path,
                "amount": r.amount,
                "abs_amount": r.abs_amount,
                "currency": r.currency,
                "description": r.description,
                "transfer_to": r.transfer_to,
                "tx_type": r.tx_type,
                "error": r.error,
            }
            for r in preview.rows
        ],
        new_accounts=preview.new_accounts,
        existing_accounts=preview.existing_accounts,
        new_categories=preview.new_categories,
        existing_categories=preview.existing_categories,
        currencies_to_add=preview.currencies_to_add,
        totals=ImportTotals(**preview.totals),
    )


class ConfirmRequest(BaseModel):
    import_token: str


@router.post("/confirm", response_model=ConfirmResponse)
def confirm(
    data: ConfirmRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    entry = _PREVIEW_CACHE.get(data.import_token)
    if not entry:
        raise HTTPException(status_code=404, detail="Preview не найден или истёк (повторите загрузку)")
    owner_id, rows, _ = entry
    if owner_id != user_id:
        raise HTTPException(status_code=403, detail="Чужой preview")

    result = svc.execute_import(db, user_id, rows)
    _PREVIEW_CACHE.pop(data.import_token, None)
    return ConfirmResponse(**result)
