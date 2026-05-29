"""Хелперы для работы с мультивалютными счетами."""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.user import User
from app.schemas.account import AccountBalanceResponse, AccountResponse
from app.services import exchange as exchange_svc


def get_user_main_currency(db: Session, user_id: int) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    return (user.main_currency if user and user.main_currency else "RUB").upper()


def get_or_create_balance(
    db: Session,
    account_id: int,
    currency: str,
) -> AccountBalance:
    """Возвращает существующий AccountBalance или создаёт новый с балансом 0."""
    currency = currency.upper()
    bal = db.query(AccountBalance).filter(
        AccountBalance.account_id == account_id,
        AccountBalance.currency == currency,
    ).first()
    if bal is None:
        bal = AccountBalance(account_id=account_id, currency=currency, balance=0.0)
        db.add(bal)
        db.flush()
    return bal


def serialize_account(
    db: Session,
    account: Account,
    main_currency: str,
) -> AccountResponse:
    """Готовит AccountResponse со списком balances и total_in_main.

    Использует convert_for_user — учитывает ручные курсы пользователя.
    """
    balances_out = []
    total_in_main = 0.0
    for b in account.balances:
        try:
            in_main = exchange_svc.convert_for_user(
                db, account.user_id, b.balance, b.currency, main_currency,
            )
        except exchange_svc.ExchangeError:
            in_main = 0.0
        balances_out.append(
            AccountBalanceResponse(
                currency=b.currency,
                balance=round(b.balance, 2),
                balance_in_main=in_main,
            )
        )
        total_in_main += in_main

    return AccountResponse(
        id=account.id,
        user_id=account.user_id,
        name=account.name,
        type=account.type,
        color=account.color,
        icon=account.icon,
        group_id=account.group_id,
        balances=balances_out,
        total_in_main=round(total_in_main, 2),
    )
