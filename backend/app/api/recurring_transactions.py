from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.recurring_transaction import RecurringTransaction, RecurringTransactionRun
from app.models.transaction import TransactionType
from app.schemas.recurring_transaction import (
    RecurringTransactionCreate,
    RecurringTransactionResponse,
    RecurringTransactionRunResponse,
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
    if not data.account_id:
        raise HTTPException(status_code=400, detail="Для регулярной операции выберите счёт")
    if data.frequency == "custom" and not data.custom_interval_days:
        raise HTTPException(status_code=400, detail="Укажите интервал повторения в днях")
    if data.end_date and data.end_date < data.next_date:
        raise HTTPException(status_code=400, detail="Дата окончания не может быть раньше первого повторения")
    _validate_refs(db, user_id, data.account_id, data.category_id)
    result = RecurringTransaction(
        user_id=user_id, name=data.name.strip(), type=TransactionType[data.type], amount=data.amount,
        currency=data.currency.upper(), account_id=data.account_id, category_id=data.category_id,
        description=data.description, frequency=data.frequency, next_date=data.next_date,
        custom_interval_days=data.custom_interval_days if data.frequency == "custom" else None,
        execution_mode=data.execution_mode, reminder_days=data.reminder_days, end_date=data.end_date,
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
    frequency = changes.get("frequency", result.frequency)
    custom_interval_days = changes.get("custom_interval_days", result.custom_interval_days)
    if frequency == "custom" and not custom_interval_days:
        raise HTTPException(status_code=400, detail="Укажите интервал повторения в днях")
    next_date = changes.get("next_date", result.next_date)
    end_date = changes.get("end_date", result.end_date)
    if end_date and end_date < next_date:
        raise HTTPException(status_code=400, detail="Дата окончания не может быть раньше следующего повторения")
    _validate_refs(db, user_id, changes.get("account_id", result.account_id), changes.get("category_id", result.category_id))
    for field, value in changes.items():
        setattr(result, field, value.strip() if field == "name" else value.upper() if field == "currency" else value)
    db.commit()
    db.refresh(result)
    return result


def _get_recurring(db: Session, user_id: int, recurring_id: int) -> RecurringTransaction:
    result = db.query(RecurringTransaction).filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == user_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Регулярная операция не найдена")
    return result


@router.post("/{recurring_id}/skip", response_model=RecurringTransactionResponse)
def skip_next_recurring_transaction(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    """Skip only the nearest occurrence and retain the rest of the schedule."""
    ensure_family_plan(db, user_id)
    result = _get_recurring(db, user_id, recurring_id)
    if not result.is_active:
        raise HTTPException(status_code=400, detail="Сначала включите регулярную операцию")
    db.add(RecurringTransactionRun(recurring_transaction_id=result.id, scheduled_for=result.next_date, status="skipped"))
    from app.services.recurring_transactions import next_occurrence
    result.last_generated_for = result.next_date
    result.next_date = next_occurrence(result.next_date, result.frequency, result.custom_interval_days)
    db.commit()
    db.refresh(result)
    return result


@router.post("/{recurring_id}/finish", response_model=RecurringTransactionResponse)
def finish_recurring_transaction(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    result = _get_recurring(db, user_id, recurring_id)
    result.is_active = False
    db.commit()
    db.refresh(result)
    return result


@router.get("/{recurring_id}/runs", response_model=List[RecurringTransactionRunResponse])
def recurring_transaction_runs(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    _get_recurring(db, user_id, recurring_id)
    return db.query(RecurringTransactionRun).filter(
        RecurringTransactionRun.recurring_transaction_id == recurring_id
    ).order_by(RecurringTransactionRun.scheduled_for.desc()).limit(50).all()


@router.delete("/{recurring_id}", status_code=204)
def delete_recurring_transaction(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    result = db.query(RecurringTransaction).filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == user_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Регулярная операция не найдена")
    db.delete(result)
    db.commit()
