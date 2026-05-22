from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from app.models.account import Account
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionResponse
from app.services.auth import decode_token

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


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

    transaction = Transaction(
        amount=data.amount,
        type=tx_type,
        description=data.description,
        date=data.date,
        account_id=data.account_id,
        category_id=data.category_id,
        user_id=user_id,
    )
    db.add(transaction)

    # обновляем баланс счёта
    if tx_type == TransactionType.income:
        account.balance += data.amount
    elif tx_type == TransactionType.expense:
        account.balance -= data.amount

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

    account = db.query(Account).filter(Account.id == tx.account_id).first()
    if account:
        if tx.type == TransactionType.income:
            account.balance -= tx.amount
        elif tx.type == TransactionType.expense:
            account.balance += tx.amount

    db.delete(tx)
    db.commit()
