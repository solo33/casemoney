"""Budgets: queries. Callers supply resolved user and database session."""
from datetime import date, timedelta
from app.application import ApplicationError
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.schemas.budget import BudgetSuggestion
from app.services import accounts as accounts_svc
from app.services.exchange import convert_transaction_for_user
from app.operations.budgets.common import _period_start, _serialize, PERIODS


def list_budgets(period: str='month', anchor: date | None=None, db: Session=None, user_id: int=None):
    if period not in PERIODS:
        raise ApplicationError(status_code=400, detail="Неподдерживаемый период бюджета")
    selected_start = _period_start(anchor or date.today(), period)
    budgets = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.period == period,
        Budget.period_start == selected_start,
    ).order_by(Budget.id).all()
    categories = {c.id: c for c in db.query(Category).filter(Category.id.in_([b.category_id for b in budgets])).all()}
    return [_serialize(db, budget, categories[budget.category_id]) for budget in budgets if budget.category_id in categories]


def budget_suggestions(period: str='month', anchor: date | None=None, db: Session=None, user_id: int=None):
    if period not in PERIODS:
        raise ApplicationError(status_code=400, detail="Неподдерживаемый период бюджета")
    main_currency = accounts_svc.get_user_main_currency(db, user_id)
    selected_start = _period_start(anchor or date.today(), period)
    # Берём 12 полных календарных месяцев до выбранного периода. Делим всегда
    # на 12, а не только на месяцы с расходами: так разовая покупка не
    # превращается в завышенный ежемесячный лимит.
    since = date(selected_start.year - 1, selected_start.month, 1)
    previous_end = selected_start - timedelta(days=1)
    already_budgeted = {row[0] for row in db.query(Budget.category_id).filter(
        Budget.user_id == user_id, Budget.period == period, Budget.period_start == selected_start,
    ).all()}
    rows = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.type == TransactionType.expense,
        Transaction.is_planned.is_(False),
        Transaction.category_id.isnot(None),
        func.date(Transaction.date) >= since,
        func.date(Transaction.date) <= previous_end,
    ).all()
    by_category: dict[int, dict] = {}
    for row in rows:
        category_id = row.category_id
        if category_id in already_budgeted:
            continue
        bucket = by_category.setdefault(category_id, {"total": 0, "months": set()})
        bucket["total"] += convert_transaction_for_user(db, user_id, row, main_currency)
        bucket["months"].add((row.date.year, row.date.month))
    categories = {c.id: c for c in db.query(Category).filter(Category.id.in_(by_category.keys())).all()}
    result = []
    for category_id, bucket in by_category.items():
        category = categories.get(category_id)
        if category:
            months = len(bucket["months"])
            result.append(BudgetSuggestion(
                category_id=category_id, category_name=category.name, category_icon=category.icon,
                average_amount=round(bucket["total"] / 12), currency=main_currency, months_with_data=months,
            ))
    return sorted(result, key=lambda item: item.average_amount, reverse=True)
