"""Shared balance effects and audit snapshots. Caller owns the DB transaction."""
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.transaction_history import TransactionHistory
from app.services import accounts as accounts_svc


def apply_transaction_effect(db: Session, tx: Transaction, reverse: bool = False) -> None:
    """Применяет (или откатывает при reverse=True) эффект всей операции на балансы.

    income  → счёт +amount
    expense → счёт −amount
    transfer→ счёт-источник −amount, счёт-получатель +to_amount (двусторонний перевод)
    """
    if tx.is_planned:
        return
    account_ids = {tx.account_id}
    if tx.to_account_id:
        account_ids.add(tx.to_account_id)
    db.query(Account.id).filter(Account.id.in_(account_ids)).order_by(Account.id).with_for_update().all()
    sign = -1 if reverse else 1
    if tx.type == TransactionType.income:
        bal = accounts_svc.get_or_create_balance(db, tx.account_id, tx.currency)
        bal.balance += sign * tx.amount
    elif tx.type == TransactionType.expense:
        bal = accounts_svc.get_or_create_balance(db, tx.account_id, tx.currency)
        bal.balance -= sign * tx.amount
    elif tx.type == TransactionType.transfer:
        # списание с источника
        src = accounts_svc.get_or_create_balance(db, tx.account_id, tx.currency)
        src.balance -= sign * tx.amount
        # зачисление на получателя
        if tx.to_account_id and tx.to_currency and tx.to_amount is not None:
            dst = accounts_svc.get_or_create_balance(db, tx.to_account_id, tx.to_currency)
            dst.balance += sign * tx.to_amount


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


def write_transaction_history(db: Session, user_id: int, tx: Transaction, action: str,
                   prev_amount: Optional[Decimal] = None, prev_currency: Optional[str] = None) -> None:
    """Записать событие в журнал изменений (денормализованный снимок)."""
    # Для перевода вместо категории показываем счёт-получатель
    if tx.type == TransactionType.transfer and tx.to_account_id:
        category_name = _account_name(db, tx.to_account_id)
    else:
        category_name = _category_path(db, user_id, tx.category_id)

    db.add(TransactionHistory(
        user_id=user_id,
        transaction_id=tx.id,
        action=action,
        op_date=tx.date,
        type=tx.type.value,
        amount=tx.amount,
        currency=tx.currency,
        account_name=_account_name(db, tx.account_id),
        category_name=category_name,
        description=tx.description,
        prev_amount=prev_amount,
        prev_currency=prev_currency,
    ))
