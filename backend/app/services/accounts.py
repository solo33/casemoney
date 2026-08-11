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
    convert_balances: bool = True,
) -> AccountResponse:
    """Готовит AccountResponse со списком balances и total_in_main.

    Использует convert_for_user — учитывает ручные курсы пользователя.
    """
    balances_out = []
    total_in_main = 0.0
    # Keep the familiar base currency first regardless of insertion order.
    # The remaining currencies use a stable alphabetical order.
    balances = sorted(
        account.balances,
        key=lambda balance: (
            balance.currency.upper() != "RUB",
            balance.currency.upper(),
        ),
    )
    for b in balances:
        if convert_balances:
            try:
                in_main = exchange_svc.convert_for_user(
                    db, account.user_id, b.balance, b.currency, main_currency,
                )
            except exchange_svc.ExchangeError:
                in_main = 0.0
        else:
            # Быстрый вариант для форм выбора счёта: сырые валютные остатки
            # нужны сразу, а сетевой пересчёт в основную валюту будет позже.
            in_main = b.balance if b.currency.upper() == main_currency.upper() else 0.0
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
        include_in_balance=account.include_in_balance,
        show_for_entries=account.show_for_entries,
        note=account.note,
        balances=balances_out,
        total_in_main=round(total_in_main, 2),
    )


def prime_account_rates(
    db: Session,
    accounts: list[Account],
    main_currency: str,
) -> None:
    """Prime balance conversion rates for an account collection at once."""
    if not accounts:
        return
    exchange_svc.prime_user_rates(
        db,
        accounts[0].user_id,
        {
            balance.currency
            for account in accounts
            for balance in account.balances
        },
        main_currency,
    )
