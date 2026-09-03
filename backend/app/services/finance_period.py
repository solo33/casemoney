"""Shared, historical-rate-aware financial aggregation helpers.

Reports, deterministic insights and the bounded AI helper must agree on the
same definition of income and expense.  Keeping this small service separate
prevents subtle differences in filters or currency conversion from appearing
as contradictory numbers in the product.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.transaction import Transaction, TransactionType
from app.services import exchange as exchange_svc


@dataclass
class PeriodTotals:
    income: float = 0.0
    expense: float = 0.0
    expense_categories: dict[int | None, float] | None = None


def _date_filter(column, value, *, is_start: bool):
    """Use timestamps where available; date-only boundaries stay inclusive."""
    if isinstance(value, datetime):
        return column >= value if is_start else column < value
    return func.date(column) >= value if is_start else func.date(column) <= value


def financial_period_totals(
    db: Session,
    user_id: int,
    start: date | datetime,
    end: date | datetime,
    currency: str,
    *,
    include_planned: bool = False,
    include_expense_categories: bool = False,
    category_type: TransactionType | None = None,
) -> PeriodTotals:
    """Aggregate actual income/expenses in ``currency`` using saved rates.

    Financing operations and transfers are deliberately excluded: they move
    money but are not earned income or consumption.  A legacy operation with
    no usable rate is skipped rather than making an entire dashboard fail.
    """
    query = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        # Общая покупка остаётся движением по личному счёту, но её анализ
        # ведёт владелец семьи после явного принятия, а не личный отчёт того,
        # кто оплатил покупку.
        Transaction.is_family_expense.is_(False),
        _date_filter(Transaction.date, start, is_start=True),
        _date_filter(Transaction.date, end, is_start=False),
        Transaction.is_financing.is_(False),
        Transaction.type.in_([TransactionType.income, TransactionType.expense]),
    )
    if not include_planned:
        query = query.filter(Transaction.is_planned.is_(False))

    collect_categories = include_expense_categories or category_type is not None
    category_type = category_type or TransactionType.expense
    result = PeriodTotals(expense_categories={} if collect_categories else None)
    for transaction in query.all():
        try:
            amount = exchange_svc.convert_transaction_for_user(db, user_id, transaction, currency)
        except exchange_svc.ExchangeError:
            continue
        if transaction.type == TransactionType.income:
            result.income += amount
        else:
            result.expense += amount
        if result.expense_categories is not None and transaction.type == category_type:
            category_id = transaction.category_id
            result.expense_categories[category_id] = result.expense_categories.get(category_id, 0.0) + amount

    result.income = round(result.income, 2)
    result.expense = round(result.expense, 2)
    if result.expense_categories is not None:
        result.expense_categories = {key: round(value, 2) for key, value in result.expense_categories.items()}
    return result
