"""Dashboard: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, extract
from datetime import datetime, timezone, timedelta, time
from app.models.account import Account
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc
from app.services.upcoming_events import list_upcoming_events
from app.operations.dashboard.common import _to_main
from app.schemas.dashboard_views import AccountSummary, DashboardResponse, ForecastItem, ForecastSummary, RecentTransaction


def get_dashboard(forecast_days: int=30, db: Session=None, user_id: int=None):
    main = accounts_svc.get_user_main_currency(db, user_id)
    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year

    # 1. Счета — каждый со своим total_in_main
    accounts = (
        db.query(Account)
        .options(selectinload(Account.balances))
        .filter(Account.user_id == user_id)
        .all()
    )
    accounts_svc.prime_account_rates(db, accounts, main)
    accounts_serialized = [
        accounts_svc.serialize_account(db, a, main) for a in accounts
    ]
    # В общий баланс попадают только счета с include_in_balance=True
    if any(a.total_in_main is None for a in accounts_serialized):
        raise exchange_svc.ExchangeError("Account conversion unavailable")
    total_balance = sum(
        a.total_in_main for a in accounts_serialized if a.include_in_balance
    )

    accounts_summary = [
        AccountSummary(
            id=a.id, name=a.name, total_in_main=a.total_in_main,
            type=a.type, color=a.color, icon=a.icon,
        )
        for a in accounts_serialized
    ]

    # 2. Месячные доходы/расходы — конвертим каждую транзакцию в main
    month_transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_family_expense.is_(False),
            Transaction.is_planned.is_(False),
            extract("month", Transaction.date) == current_month,
            extract("year", Transaction.date) == current_year,
        )
        .all()
    )
    exchange_svc.prime_user_rates(
        db,
        user_id,
        {transaction.currency for transaction in month_transactions},
        main,
    )

    month_income = sum(
        _to_main(db, user_id, t.amount, t.currency, main, transaction=t)
        for t in month_transactions if t.type == TransactionType.income and not t.is_financing
    )
    month_expense = sum(
        _to_main(db, user_id, t.amount, t.currency, main, transaction=t)
        for t in month_transactions if t.type == TransactionType.expense
    )

    categories_map = {
        c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }
    # Подробные категории и месячный тренд грузятся отдельными report-эндпоинтами.
    # На главной это резко сокращает ожидание для аккаунтов с большой историей.
    top_categories = []
    monthly_stats = []

    # 5. Последние 10 транзакций
    recent_rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.is_family_expense.is_(False), Transaction.is_planned.is_(False))
        .order_by(Transaction.date.desc())
        .limit(10)
        .all()
    )
    accounts_map = {a.id: a for a in accounts}

    def _serialize_tx(t) -> RecentTransaction:
        acc = accounts_map.get(t.account_id)
        cat = categories_map.get(t.category_id) if t.category_id else None
        return RecentTransaction(
            id=t.id,
            amount=t.amount,
            currency=t.currency,
            type=t.type.value,
            description=t.description,
            date=t.date,
            account_id=t.account_id,
            account_name=acc.name if acc else "—",
            category_id=t.category_id,
            category_name=cat.name if cat else None,
            category_icon=cat.icon if cat else None,
            to_account_id=t.to_account_id,
            to_amount=t.to_amount,
            to_currency=t.to_currency,
            is_family_expense=t.is_family_expense,
            reimbursement_amount=t.reimbursement_amount,
            updated_at=t.updated_at,
        )

    recent_transactions = [_serialize_tx(t) for t in recent_rows]

    # 6. Последние изменённые — по updated_at (fallback на date через coalesce).
    # После импорта у тысяч записей updated_at совпадает с точностью до секунды —
    # без tie-break по дате операции порядок внутри пачки произвольный (могут
    # всплыть записи 2012 года). Свежие операции — выше.
    changed_rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.is_family_expense.is_(False), Transaction.is_planned.is_(False))
        .order_by(
            func.coalesce(Transaction.updated_at, Transaction.date).desc(),
            Transaction.date.desc(),
            Transaction.id.desc(),
        )
        .limit(8)
        .all()
    )
    recently_changed = [_serialize_tx(t) for t in changed_rows]

    # Прогноз — отдельный от фактического баланса расчёт. Плановые записи не
    # меняют остатки счетов до «Учесть», но помогают увидеть ожидаемый баланс.
    # План на сегодня тоже должен быть виден весь день: операции нередко
    # сохраняются с полуденным временем, а дашборд может открыться вечером.
    forecast_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    forecast_end = forecast_start + timedelta(days=forecast_days)
    # Одна лента будущего для главной и календаря.  Раньше дашборд считал
    # только Transaction.is_planned и терял платежи по обязательствам,
    # депозитам и регулярным операциям, которые показывал отдельный виджет.
    upcoming = list_upcoming_events(db, user_id, forecast_start.date(), forecast_end.date())
    exchange_svc.prime_user_rates(
        db, user_id, {item["currency"] for item in upcoming}, main,
    )
    forecast_income = 0
    forecast_expense = 0
    forecast_events = []
    for item in upcoming:
        converted = _to_main(db, user_id, item["amount"], item["currency"], main)
        impact = 0
        if item["type"] == TransactionType.income.value:
            impact = converted
            forecast_income += converted
        elif item["type"] == TransactionType.expense.value:
            impact = -converted
            forecast_expense += converted
        acc = accounts_map.get(item.get("account_id"))
        cat = categories_map.get(item.get("category_id")) if item.get("category_id") else None
        forecast_events.append(ForecastItem(
            id=item["id"],
            date=datetime.combine(item["date"], time.min, tzinfo=timezone.utc),
            type=item["type"],
            amount=item["amount"],
            currency=item["currency"],
            impact_in_main=round(impact, 2),
            description=item["title"],
            account_name=acc.name if acc else "—",
            category_name=cat.name if cat else None,
        ))
    forecast_net = forecast_income - forecast_expense
    forecast = ForecastSummary(
        days=forecast_days,
        until_date=forecast_end,
        income=round(forecast_income, 2),
        expense=round(forecast_expense, 2),
        net=round(forecast_net, 2),
        projected_balance=round(total_balance + forecast_net, 2),
        events=forecast_events,
    )

    return DashboardResponse(
        main_currency=main,
        total_balance=round(total_balance, 2),
        month_income=round(month_income, 2),
        month_expense=round(month_expense, 2),
        accounts=accounts_summary,
        top_categories=top_categories,
        monthly_stats=monthly_stats,
        recent_transactions=recent_transactions,
        recently_changed=recently_changed,
        forecast=forecast,
    )
