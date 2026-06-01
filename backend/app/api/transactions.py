from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.category import Category
from app.models.transaction_history import TransactionHistory
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionResponse
from app.services.auth import decode_token
from app.services import accounts as accounts_svc

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _apply_to_balance(
    bal: AccountBalance, tx_type: TransactionType, amount: float, reverse: bool = False
) -> None:
    """Применяет/отменяет дельту транзакции к балансу."""
    sign = -1 if reverse else 1
    if tx_type == TransactionType.income:
        bal.balance += sign * amount
    elif tx_type == TransactionType.expense:
        bal.balance -= sign * amount
    # transfer пока обрабатываем как изменение одного счёта (без второй стороны)


def _category_path(db: Session, user_id: int, category_id: Optional[int]) -> Optional[str]:
    if not category_id:
        return None
    c = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
    if not c:
        return None
    if c.parent_id:
        p = db.query(Category).filter(Category.id == c.parent_id).first()
        return f"{p.name}\\{c.name}" if p else c.name
    return c.name


def _account_name(db: Session, account_id: int) -> str:
    a = db.query(Account).filter(Account.id == account_id).first()
    return a.name if a else "—"


def _write_history(db: Session, user_id: int, tx: Transaction, action: str,
                   prev_amount: Optional[float] = None, prev_currency: Optional[str] = None) -> None:
    """Записать событие в журнал изменений (денормализованный снимок)."""
    db.add(TransactionHistory(
        user_id=user_id,
        transaction_id=tx.id,
        action=action,
        op_date=tx.date,
        type=tx.type.value,
        amount=tx.amount,
        currency=tx.currency,
        account_name=_account_name(db, tx.account_id),
        category_name=_category_path(db, user_id, tx.category_id),
        description=tx.description,
        prev_amount=prev_amount,
        prev_currency=prev_currency,
    ))


def _expand_categories(db: Session, user_id: int, category_id: int) -> list[int]:
    """Возвращает category_id + все дочерние (для иерархического фильтра)."""
    children = db.query(Category.id).filter(
        Category.user_id == user_id,
        Category.parent_id == category_id,
    ).all()
    return [category_id] + [c[0] for c in children]


class TransactionsPage(BaseModel):
    items: List[TransactionResponse]
    total: int
    limit: int
    offset: int


class HistoryItem(BaseModel):
    id: int
    transaction_id: Optional[int]
    action: str
    changed_at: datetime
    op_date: Optional[datetime]
    type: str
    amount: float
    currency: str
    account_name: Optional[str]
    category_name: Optional[str]
    description: Optional[str]
    prev_amount: Optional[float]
    prev_currency: Optional[str]

    class Config:
        from_attributes = True


class HistoryPage(BaseModel):
    items: List[HistoryItem]
    total: int
    limit: int
    offset: int


@router.get("/history", response_model=HistoryPage)
def get_history(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Журнал изменений операций пользователя (новые сверху)."""
    base = db.query(TransactionHistory).filter(TransactionHistory.user_id == user_id)
    total = base.count()
    items = (
        base.order_by(TransactionHistory.changed_at.desc(), TransactionHistory.id.desc())
        .offset(offset).limit(limit).all()
    )
    return HistoryPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/", response_model=TransactionsPage)
def get_transactions(
    account_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None, description="income | expense | transfer"),
    category_id: Optional[int] = Query(None, description="вкл. подкатегории"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    q: Optional[str] = Query(None, description="Поиск в описании"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    if type:
        try:
            query = query.filter(Transaction.type == TransactionType[type])
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid type: {type}")
    if category_id is not None:
        cat_ids = _expand_categories(db, user_id, category_id)
        query = query.filter(Transaction.category_id.in_(cat_ids))
    if date_from:
        query = query.filter(func.date(Transaction.date) >= date_from)
    if date_to:
        query = query.filter(func.date(Transaction.date) <= date_to)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(func.lower(Transaction.description).like(like))

    total = query.count()
    items = (
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset).limit(limit).all()
    )
    return TransactionsPage(items=items, total=total, limit=limit, offset=offset)


@router.post("/", response_model=TransactionResponse, status_code=201)
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    account = db.query(Account).filter(
        Account.id == data.account_id, Account.user_id == user_id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        tx_type = TransactionType[data.type]
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Invalid type: {data.type}")

    if data.currency:
        currency = data.currency.upper()
    elif account.balances:
        currency = account.balances[0].currency
    else:
        currency = accounts_svc.get_user_main_currency(db, user_id)

    bal = accounts_svc.get_or_create_balance(db, account.id, currency)

    transaction = Transaction(
        amount=data.amount,
        currency=currency,
        type=tx_type,
        description=data.description,
        date=data.date,
        account_id=data.account_id,
        category_id=data.category_id,
        user_id=user_id,
    )
    db.add(transaction)
    _apply_to_balance(bal, tx_type, data.amount, reverse=False)
    db.flush()
    _write_history(db, user_id, transaction, "created")
    db.commit()
    db.refresh(transaction)
    return transaction


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Редактирование транзакции. Балансы пересчитываются корректно:
    откат старого эффекта → применение нового."""
    tx = db.query(Transaction).filter(
        Transaction.id == transaction_id, Transaction.user_id == user_id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    update = data.model_dump(exclude_unset=True)

    # Снимок до изменений (для журнала)
    prev_amount, prev_currency = tx.amount, tx.currency

    # Если меняется счёт — проверим, что он принадлежит пользователю
    if "account_id" in update and update["account_id"] is not None:
        acc = db.query(Account).filter(
            Account.id == update["account_id"], Account.user_id == user_id
        ).first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

    # Откатываем эффект старого состояния (на старом счёте/валюте)
    old_bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == tx.account_id,
        AccountBalance.currency == tx.currency,
    ).first()
    if old_bal is not None:
        _apply_to_balance(old_bal, tx.type, tx.amount, reverse=True)

    # Применяем изменения
    if "type" in update:
        try:
            update["type"] = TransactionType[update["type"]]
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid type: {update['type']}")
    if "currency" in update and update["currency"]:
        update["currency"] = update["currency"].upper()

    for k, v in update.items():
        setattr(tx, k, v)

    # Применяем новый эффект на актуальном (account, currency)
    new_bal = accounts_svc.get_or_create_balance(db, tx.account_id, tx.currency)
    _apply_to_balance(new_bal, tx.type, tx.amount, reverse=False)

    db.flush()
    _write_history(db, user_id, tx, "edited", prev_amount=prev_amount, prev_currency=prev_currency)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    tx = db.query(Transaction).filter(
        Transaction.id == transaction_id, Transaction.user_id == user_id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == tx.account_id,
        AccountBalance.currency == tx.currency,
    ).first()
    if bal is not None:
        _apply_to_balance(bal, tx.type, tx.amount, reverse=True)

    _write_history(db, user_id, tx, "deleted")
    db.delete(tx)
    db.commit()
