from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import TransactionType
from app.schemas.recurring_transaction import (
    RecurringTransactionCreate,
    RecurringTransactionResponse,
    RecurringTransactionUpdate,
)
from app.services.auth import decode_token
from app.services.plans import ensure_family_plan

router = APIRouter(prefix="/api/recurring-transactions", tags=["recurring transactions"])
security = HTTPBearer()


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _validate_refs(db: Session, user_id: int, account_id: int | None, category_id: int | None) -> None:
    if account_id and not db.query(Account.id).filter(Account.id == account_id, Account.user_id == user_id).first():
        raise HTTPException(status_code=404, detail="Счёт не найден")
    if category_id and not db.query(Category.id).filter(Category.id == category_id, Category.user_id == user_id).first():
        raise HTTPException(status_code=404, detail="Категория не найдена")


@router.get("/", response_model=List[RecurringTransactionResponse])
def list_recurring_transactions(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    return db.query(RecurringTransaction).filter(RecurringTransaction.user_id == user_id).order_by(
        RecurringTransaction.is_active.desc(), RecurringTransaction.next_date.asc(), RecurringTransaction.name.asc()
    ).all()


@router.post("/", response_model=RecurringTransactionResponse, status_code=201)
def create_recurring_transaction(data: RecurringTransactionCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    _validate_refs(db, user_id, data.account_id, data.category_id)
    result = RecurringTransaction(
        user_id=user_id, name=data.name.strip(), type=TransactionType[data.type], amount=data.amount,
        currency=data.currency.upper(), account_id=data.account_id, category_id=data.category_id,
        description=data.description, frequency=data.frequency, next_date=data.next_date,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.patch("/{recurring_id}", response_model=RecurringTransactionResponse)
def update_recurring_transaction(recurring_id: int, data: RecurringTransactionUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    result = db.query(RecurringTransaction).filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == user_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Регулярная операция не найдена")
    changes = data.model_dump(exclude_unset=True)
    _validate_refs(db, user_id, changes.get("account_id", result.account_id), changes.get("category_id", result.category_id))
    for field, value in changes.items():
        setattr(result, field, value.strip() if field == "name" else value.upper() if field == "currency" else value)
    db.commit()
    db.refresh(result)
    return result


@router.delete("/{recurring_id}", status_code=204)
def delete_recurring_transaction(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    result = db.query(RecurringTransaction).filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == user_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Регулярная операция не найдена")
    db.delete(result)
    db.commit()
