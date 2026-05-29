from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from app.models.account import Account
from app.models.account_balance import AccountBalance
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


@router.get("/", response_model=List[TransactionResponse])
def get_transactions(
    account_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    q = db.query(Transaction).filter(Transaction.user_id == user_id)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if type:
        q = q.filter(Transaction.type == TransactionType[type])
    return q.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()


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

    # Определяем валюту транзакции
    if data.currency:
        currency = data.currency.upper()
    elif account.balances:
        currency = account.balances[0].currency
    else:
        # fallback на main_currency пользователя
        currency = accounts_svc.get_user_main_currency(db, user_id)

    # find or auto-create balance row для этого account+currency
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

    db.commit()
    db.refresh(transaction)
    return transaction


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

    # Откатываем эффект на конкретный balance
    bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == tx.account_id,
        AccountBalance.currency == tx.currency,
    ).first()
    if bal is not None:
        _apply_to_balance(bal, tx.type, tx.amount, reverse=True)

    db.delete(tx)
    db.commit()
