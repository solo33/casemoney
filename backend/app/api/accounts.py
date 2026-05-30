from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.account_group import AccountGroup
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountBalanceCreate,
    AccountBalanceUpdate,
    AccountBalanceResponse,
    AccountGroupBucket,
    GroupSummary,
)
from app.services.auth import decode_token
from app.services import accounts as accounts_svc
from app.services import limits as limits_svc

router = APIRouter(prefix="/api/accounts", tags=["accounts"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _validate_group(db: Session, user_id: int, group_id: Optional[int]) -> None:
    if group_id is None:
        return
    exists = db.query(AccountGroup).filter(
        AccountGroup.id == group_id,
        AccountGroup.user_id == user_id,
    ).first()
    if not exists:
        raise HTTPException(status_code=400, detail="Group not found")


def _get_account(db: Session, account_id: int, user_id: int) -> Account:
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == user_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


# --- Accounts CRUD ---

@router.get("/", response_model=List[AccountResponse])
def get_accounts(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Плоский список со всеми балансами и total_in_main."""
    main = accounts_svc.get_user_main_currency(db, user_id)
    accounts = db.query(Account).filter(Account.user_id == user_id).all()
    return [accounts_svc.serialize_account(db, a, main) for a in accounts]


@router.get("/grouped", response_model=List[AccountGroupBucket])
def get_accounts_grouped(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Сгруппированный список. total_in_main для группы = сумма total_in_main счетов."""
    main = accounts_svc.get_user_main_currency(db, user_id)
    groups = (
        db.query(AccountGroup)
        .filter(AccountGroup.user_id == user_id)
        .order_by(AccountGroup.sort_order, AccountGroup.id)
        .all()
    )
    accounts = db.query(Account).filter(Account.user_id == user_id).all()

    by_group: dict[Optional[int], list[Account]] = {}
    for a in accounts:
        by_group.setdefault(a.group_id, []).append(a)

    result: list[AccountGroupBucket] = []
    for g in groups:
        bucket_accounts = by_group.get(g.id, [])
        serialized = [accounts_svc.serialize_account(db, a, main) for a in bucket_accounts]
        result.append(AccountGroupBucket(
            group=GroupSummary(id=g.id, name=g.name, sort_order=g.sort_order),
            accounts=serialized,
            total_in_main=round(sum(
                a.total_in_main for a in serialized if a.include_in_balance
            ), 2),
        ))

    ungrouped = by_group.get(None, [])
    if ungrouped:
        serialized = [accounts_svc.serialize_account(db, a, main) for a in ungrouped]
        result.append(AccountGroupBucket(
            group=GroupSummary(id=None, name="Без группы", sort_order=10_000),
            accounts=serialized,
            total_in_main=round(sum(
                a.total_in_main for a in serialized if a.include_in_balance
            ), 2),
        ))

    return result


@router.post("/", response_model=AccountResponse, status_code=201)
def create_account(
    data: AccountCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    limits_svc.enforce_limit(db, user_id, "accounts")
    _validate_group(db, user_id, data.group_id)
    account = Account(
        name=data.name,
        type=data.type,
        color=data.color,
        icon=data.icon,
        group_id=data.group_id,
        include_in_balance=data.include_in_balance,
        user_id=user_id,
    )
    db.add(account)
    db.flush()  # получить account.id для balance

    # создаём первый AccountBalance
    initial = AccountBalance(
        account_id=account.id,
        currency=data.initial_currency.upper(),
        balance=data.initial_balance,
    )
    db.add(initial)
    db.commit()
    db.refresh(account)

    main = accounts_svc.get_user_main_currency(db, user_id)
    return accounts_svc.serialize_account(db, account, main)


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    account = _get_account(db, account_id, user_id)
    update_fields = data.model_dump(exclude_unset=True)
    if "group_id" in update_fields:
        _validate_group(db, user_id, update_fields["group_id"])
    for key, value in update_fields.items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    main = accounts_svc.get_user_main_currency(db, user_id)
    return accounts_svc.serialize_account(db, account, main)


@router.delete("/{account_id}", status_code=204)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    account = _get_account(db, account_id, user_id)
    db.delete(account)
    db.commit()


# --- AccountBalances CRUD (валюты внутри счёта) ---

@router.get("/{account_id}/balances", response_model=List[AccountBalanceResponse])
def list_balances(
    account_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    account = _get_account(db, account_id, user_id)
    main = accounts_svc.get_user_main_currency(db, user_id)
    serialized = accounts_svc.serialize_account(db, account, main)
    return serialized.balances


@router.post("/{account_id}/balances", response_model=AccountBalanceResponse, status_code=201)
def add_balance(
    account_id: int,
    data: AccountBalanceCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    account = _get_account(db, account_id, user_id)
    currency = data.currency.upper()

    exists = db.query(AccountBalance).filter(
        AccountBalance.account_id == account.id,
        AccountBalance.currency == currency,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"Баланс в {currency} уже существует")

    bal = AccountBalance(
        account_id=account.id,
        currency=currency,
        balance=data.balance,
    )
    db.add(bal)
    db.commit()
    db.refresh(bal)

    main = accounts_svc.get_user_main_currency(db, user_id)
    serialized = accounts_svc.serialize_account(db, account, main)
    for b in serialized.balances:
        if b.currency == currency:
            return b
    return AccountBalanceResponse(currency=currency, balance=bal.balance, balance_in_main=0.0)


@router.put("/{account_id}/balances/{currency}", response_model=AccountBalanceResponse)
def update_balance(
    account_id: int,
    currency: str,
    data: AccountBalanceUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    account = _get_account(db, account_id, user_id)
    currency = currency.upper()
    bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == account.id,
        AccountBalance.currency == currency,
    ).first()
    if not bal:
        raise HTTPException(status_code=404, detail="Balance not found")
    bal.balance = data.balance
    db.commit()
    db.refresh(bal)

    main = accounts_svc.get_user_main_currency(db, user_id)
    serialized = accounts_svc.serialize_account(db, account, main)
    for b in serialized.balances:
        if b.currency == currency:
            return b
    return AccountBalanceResponse(currency=currency, balance=bal.balance, balance_in_main=0.0)


@router.delete("/{account_id}/balances/{currency}", status_code=204)
def delete_balance(
    account_id: int,
    currency: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    account = _get_account(db, account_id, user_id)
    currency = currency.upper()
    bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == account.id,
        AccountBalance.currency == currency,
    ).first()
    if not bal:
        raise HTTPException(status_code=404, detail="Balance not found")
    if abs(bal.balance) > 0.005:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя удалить баланс с ненулевой суммой ({bal.balance} {currency})",
        )
    db.delete(bal)
    db.commit()
