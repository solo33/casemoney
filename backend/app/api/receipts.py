from datetime import date
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.category import Category
from app.models.receipt import Receipt, ReceiptItem
from app.models.transaction import Transaction, TransactionType
from app.schemas.receipt import ReceiptItemCreate, ReceiptItemResponse, ReceiptItemUpdate, ReceiptResponse, ReceiptUpdate
from app.services.auth import decode_token
from app.services.receipt_storage import ALLOWED_CONTENT_TYPES, MAX_RECEIPT_SIZE, build_storage_key, delete_file, file_path


router = APIRouter(prefix="/api/receipts", tags=["receipts"])
security = HTTPBearer()


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _get_receipt(db: Session, user_id: int, receipt_id: int) -> Receipt:
    result = db.query(Receipt).options(joinedload(Receipt.items)).filter(
        Receipt.id == receipt_id, Receipt.user_id == user_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Чек не найден")
    return result


def _validate_transaction(db: Session, user_id: int, transaction_id: Optional[int]) -> None:
    if transaction_id is None:
        return
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id, Transaction.user_id == user_id
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    if transaction.type != TransactionType.expense:
        raise HTTPException(status_code=400, detail="Чек можно привязать только к расходу")


def _validate_category(db: Session, user_id: int, category_id: Optional[int]) -> None:
    if category_id is None:
        return
    if not db.query(Category.id).filter(Category.id == category_id, Category.user_id == user_id).first():
        raise HTTPException(status_code=404, detail="Категория не найдена")


@router.get("", response_model=List[ReceiptResponse])
def list_receipts(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return db.query(Receipt).options(joinedload(Receipt.items)).filter(
        Receipt.user_id == user_id
    ).order_by(Receipt.receipt_date.desc(), Receipt.created_at.desc()).all()


@router.post("/upload", response_model=ReceiptResponse, status_code=201)
async def upload_receipt(
    file: UploadFile = File(...),
    merchant: Optional[str] = Form(None),
    receipt_date: Optional[date] = Form(None),
    total_amount: Optional[float] = Form(None),
    currency: str = Form("RUB"),
    note: Optional[str] = Form(None),
    transaction_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Выберите файл чека")
    try:
        storage_key = build_storage_key(file.filename)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Можно загрузить изображение JPG, PNG, WEBP или файл PDF")
    if total_amount is not None and total_amount < 0:
        raise HTTPException(status_code=422, detail="Сумма чека не может быть отрицательной")
    _validate_transaction(db, user_id, transaction_id)

    contents = await file.read(MAX_RECEIPT_SIZE + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="Файл чека пуст")
    if len(contents) > MAX_RECEIPT_SIZE:
        raise HTTPException(status_code=413, detail="Размер файла чека не должен превышать 10 МБ")

    target = file_path(storage_key)
    try:
        target.write_bytes(contents)
        result = Receipt(
            user_id=user_id,
            transaction_id=transaction_id,
            merchant=merchant.strip() if merchant else None,
            receipt_date=receipt_date,
            total_amount=total_amount,
            currency=currency.upper(),
            note=note.strip() if note else None,
            original_filename=Path(file.filename).name[:255],
            storage_key=storage_key,
            content_type=file.content_type,
            file_size=len(contents),
        )
        db.add(result)
        db.commit()
        db.refresh(result)
        return result
    except Exception:
        db.rollback()
        delete_file(storage_key)
        raise


@router.get("/{receipt_id}/file", response_class=FileResponse)
def download_receipt_file(receipt_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    receipt = _get_receipt(db, user_id, receipt_id)
    target = file_path(receipt.storage_key)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Файл чека не найден")
    return FileResponse(target, media_type=receipt.content_type or "application/octet-stream", filename=receipt.original_filename)


@router.patch("/{receipt_id}", response_model=ReceiptResponse)
def update_receipt(receipt_id: int, data: ReceiptUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    result = _get_receipt(db, user_id, receipt_id)
    changes = data.model_dump(exclude_unset=True)
    if "transaction_id" in changes:
        _validate_transaction(db, user_id, changes["transaction_id"])
    for key, value in changes.items():
        if key in {"merchant", "note"} and value is not None:
            value = value.strip() or None
        if key == "currency" and value:
            value = value.upper()
        setattr(result, key, value)
    db.commit()
    db.refresh(result)
    return result


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(receipt_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    result = _get_receipt(db, user_id, receipt_id)
    storage_key = result.storage_key
    db.delete(result)
    db.commit()
    delete_file(storage_key)


@router.post("/{receipt_id}/items", response_model=ReceiptItemResponse, status_code=201)
def create_receipt_item(receipt_id: int, data: ReceiptItemCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    receipt = _get_receipt(db, user_id, receipt_id)
    _validate_category(db, user_id, data.category_id)
    next_sort_order = len(receipt.items)
    result = ReceiptItem(receipt_id=receipt.id, sort_order=next_sort_order, **data.model_dump())
    result.name = result.name.strip()
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.patch("/{receipt_id}/items/{item_id}", response_model=ReceiptItemResponse)
def update_receipt_item(receipt_id: int, item_id: int, data: ReceiptItemUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    _get_receipt(db, user_id, receipt_id)
    result = db.query(ReceiptItem).filter(ReceiptItem.id == item_id, ReceiptItem.receipt_id == receipt_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Позиция чека не найдена")
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        _validate_category(db, user_id, changes["category_id"])
    for key, value in changes.items():
        setattr(result, key, value.strip() if key == "name" and value else value)
    db.commit()
    db.refresh(result)
    return result


@router.delete("/{receipt_id}/items/{item_id}", status_code=204)
def delete_receipt_item(receipt_id: int, item_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    _get_receipt(db, user_id, receipt_id)
    result = db.query(ReceiptItem).filter(ReceiptItem.id == item_id, ReceiptItem.receipt_id == receipt_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Позиция чека не найдена")
    db.delete(result)
    db.commit()
