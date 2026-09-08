"""Accounts: balances. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from math import isfinite
from app.models.account_balance import AccountBalance
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.transaction_history import TransactionHistory
from app.schemas.account import AccountBalanceCreate, AccountBalanceUpdate, AccountBalanceAdjustmentCreate, AccountBalanceAdjustmentResponse, AccountBalanceResponse
from app.services import accounts as accounts_svc
from app.services import family_accounts as family_accounts_svc
from app.operations.accounts.common import _get_account


def add_balance(account_id: int, data: AccountBalanceCreate, db: Session=None, user_id: int=None):
    account = _get_account(db, account_id, user_id)
    family_accounts_svc.require_write_access(db, account_id, user_id)
    currency = data.currency.upper()

    exists = db.query(AccountBalance).filter(
        AccountBalance.account_id == account.id,
        AccountBalance.currency == currency,
    ).first()
    if exists:
        raise ApplicationError(status_code=400, detail=f"Баланс в {currency} уже существует")

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


def update_balance(account_id: int, currency: str, data: AccountBalanceUpdate, db: Session=None, user_id: int=None):
    account = _get_account(db, account_id, user_id)
    currency = currency.upper()
    bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == account.id,
        AccountBalance.currency == currency,
    ).first()
    if not bal:
        raise ApplicationError(status_code=404, detail="Balance not found")
    bal.balance = data.balance
    db.commit()
    db.refresh(bal)

    main = accounts_svc.get_user_main_currency(db, user_id)
    serialized = accounts_svc.serialize_account(db, account, main)
    for b in serialized.balances:
        if b.currency == currency:
            return b
    return AccountBalanceResponse(currency=currency, balance=bal.balance, balance_in_main=0.0)


def adjust_balance(account_id: int, currency: str, data: AccountBalanceAdjustmentCreate, db: Session=None, user_id: int=None):
    """Создаёт доход/расход на разницу между фактическим и указанным остатком."""
    if not isfinite(data.balance):
        raise ApplicationError(status_code=400, detail="Некорректный остаток")

    account = family_accounts_svc.require_write_access(db, account_id, user_id)

    normalized_currency = currency.upper()
    balance = db.query(AccountBalance).filter(
        AccountBalance.account_id == account_id,
        AccountBalance.currency == normalized_currency,
    ).with_for_update().first()
    if not balance:
        raise ApplicationError(status_code=404, detail="Balance not found")

    old_balance = round(float(balance.balance), 2)
    new_balance = round(float(data.balance), 2)
    difference = round(new_balance - old_balance, 2)
    if abs(difference) < 0.005:
        raise ApplicationError(status_code=400, detail="Остаток не изменился")

    tx_type = TransactionType.income if difference > 0 else TransactionType.expense
    category = None
    if data.category_id is not None:
        category = db.query(Category).filter(
            Category.id == data.category_id,
            Category.user_id == user_id,
        ).first()
        if not category:
            raise ApplicationError(status_code=404, detail="Category not found")
        if category.type != tx_type.value:
            raise ApplicationError(
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


def delete_balance(account_id: int, currency: str, db: Session=None, user_id: int=None):
    account = _get_account(db, account_id, user_id)
    family_accounts_svc.require_write_access(db, account_id, user_id)
    currency = currency.upper()
    bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == account.id,
        AccountBalance.currency == currency,
    ).first()
    if not bal:
        raise ApplicationError(status_code=404, detail="Balance not found")
    if abs(bal.balance) > 0.005:
        raise ApplicationError(
            status_code=400,
            detail=f"Нельзя удалить баланс с ненулевой суммой ({bal.balance} {currency})",
        )
    db.delete(bal)
    db.commit()
