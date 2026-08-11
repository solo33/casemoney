from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, selectinload
from datetime import datetime, timezone
from math import isfinite
from typing import List, Optional

from app.database import get_db
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.account_group import AccountGroup
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.transaction_history import TransactionHistory
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountBalanceCreate,
    AccountBalanceUpdate,
    AccountBalanceAdjustmentCreate,
    AccountBalanceAdjustmentResponse,
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
    accounts = (
        db.query(Account)
        .options(selectinload(Account.balances))
        .filter(Account.user_id == user_id)
        .all()
    )
    accounts_svc.prime_account_rates(db, accounts, main)
    return [accounts_svc.serialize_account(db, a, main) for a in accounts]


@router.get("/grouped", response_model=List[AccountGroupBucket])
def get_accounts_grouped(
    convert_balances: bool = True,
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
    accounts = (
        db.query(Account)
        .options(selectinload(Account.balances))
        .filter(Account.user_id == user_id)
        .order_by(Account.sort_order, Account.id)
        .all()
    )
    if convert_balances:
        accounts_svc.prime_account_rates(db, accounts, main)

    by_group: dict[Optional[int], list[Account]] = {}
    for a in accounts:
        by_group.setdefault(a.group_id, []).append(a)

    result: list[AccountGroupBucket] = []
    for g in groups:
        bucket_accounts = by_group.get(g.id, [])
        serialized = [
            accounts_svc.serialize_account(db, a, main, convert_balances=convert_balances)
            for a in bucket_accounts
        ]
        result.append(AccountGroupBucket(
            group=GroupSummary(id=g.id, name=g.name, sort_order=g.sort_order),
            accounts=serialized,
            # Итог группы — сумма ВСЕХ счетов группы, независимо от include_in_balance.
            # Общий баланс дашборда (dashboard.total_balance) фильтрует по этому флагу
            # отдельно — здесь это просто справочная сумма по группе.
            total_in_main=round(sum(a.total_in_main for a in serialized), 2),
        ))

    ungrouped = by_group.get(None, [])
    if ungrouped:
        serialized = [
            accounts_svc.serialize_account(db, a, main, convert_balances=convert_balances)
            for a in ungrouped
        ]
        result.append(AccountGroupBucket(
            group=GroupSummary(id=None, name="Без группы", sort_order=10_000),
            accounts=serialized,
            total_in_main=round(sum(a.total_in_main for a in serialized), 2),
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
    show_for_entries = (
        data.show_for_entries
        if "show_for_entries" in data.model_fields_set
        else data.include_in_balance
    )
    account = Account(
        name=data.name,
        type=data.type,
        color=data.color,
        icon=data.icon,
        group_id=data.group_id,
        include_in_balance=data.include_in_balance,
        show_for_entries=show_for_entries,
        note=data.note,
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


@router.post("/reorder", status_code=204)
def reorder_accounts(
    payload: dict,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Задать порядок счетов. body: {"account_ids": [id, id, ...]} —
    sort_order назначается по позиции в списке. Опционально {"group_id": X}
    одновременно переносит все эти счета в указанную группу."""
    account_ids = payload.get("account_ids") or []
    if not isinstance(account_ids, list):
        raise HTTPException(status_code=400, detail="account_ids должен быть списком")

    target_group = payload.get("group_id", "__keep__")
    if target_group != "__keep__":
        _validate_group(db, user_id, target_group)

    # Берём только счета этого пользователя
    owned = {
        a.id: a for a in db.query(Account).filter(
            Account.user_id == user_id,
            Account.id.in_([int(x) for x in account_ids]),
        ).all()
    }
    for idx, aid in enumerate(account_ids):
        acc = owned.get(int(aid))
        if not acc:
            continue
        acc.sort_order = idx
        if target_group != "__keep__":
            acc.group_id = target_group
    db.commit()


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


@router.post(
    "/{account_id}/balances/{currency}/adjust",
    response_model=AccountBalanceAdjustmentResponse,
    status_code=201,
)
def adjust_balance(
    account_id: int,
    currency: str,
    data: AccountBalanceAdjustmentCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Создаёт доход/расход на разницу между фактическим и указанным остатком."""
    if not isfinite(data.balance):
        raise HTTPException(status_code=400, detail="Некорректный остаток")

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == user_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    normalized_currency = currency.upper()
    balance = db.query(AccountBalance).filter(
        AccountBalance.account_id == account_id,
        AccountBalance.currency == normalized_currency,
    ).with_for_update().first()
    if not balance:
        raise HTTPException(status_code=404, detail="Balance not found")

    old_balance = round(float(balance.balance), 2)
    new_balance = round(float(data.balance), 2)
    difference = round(new_balance - old_balance, 2)
    if abs(difference) < 0.005:
        raise HTTPException(status_code=400, detail="Остаток не изменился")

    tx_type = TransactionType.income if difference > 0 else TransactionType.expense
    category = None
    if data.category_id is not None:
        category = db.query(Category).filter(
            Category.id == data.category_id,
            Category.user_id == user_id,
        ).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        if category.type != tx_type.value:
            raise HTTPException(
                status_code=400,
                detail="Категория не соответствует типу корректировки",
            )

    transaction = Transaction(
        amount=abs(difference),
        currency=normalized_currency,
        type=tx_type,
        description="Корректировка остатка",
        date=datetime.now(timezone.utc),
        account_id=account_id,
        category_id=category.id if category else None,
        user_id=user_id,
    )
    db.add(transaction)
    db.flush()
    balance.balance = new_balance

    category_name = None
    if category:
        if category.parent_id:
            parent = db.query(Category).filter(Category.id == category.parent_id).first()
            category_name = f"{parent.name}\\{category.name}" if parent else category.name
        else:
            category_name = category.name
    db.add(TransactionHistory(
        user_id=user_id,
        transaction_id=transaction.id,
        action="created",
        op_date=transaction.date,
        type=tx_type.value,
        amount=transaction.amount,
        currency=normalized_currency,
        account_name=account.name,
        category_name=category_name,
        description=transaction.description,
    ))
    db.commit()

    return AccountBalanceAdjustmentResponse(
        transaction_id=transaction.id,
        currency=normalized_currency,
        old_balance=old_balance,
        new_balance=new_balance,
        difference=difference,
        type=tx_type.value,
    )


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
