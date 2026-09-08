"""Reports: summary. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone
from typing import Optional, Literal
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.services import accounts as accounts_svc
from app.services.finance_period import financial_period_totals
from app.services.plans import ensure_family_plan
from app.operations.reports.common import _to_main, resolve_period, RU_MONTHS
from app.schemas.reports_views import CategoryBreakdown, MonthlyTrendPoint, MonthlyTrendResponse, SummaryResponse


def get_summary(period: Literal['month', 'quarter', 'year', 'custom']='month', year: Optional[int]=None, month: Optional[int]=None, quarter: Optional[int]=None, date_from: Optional[date]=None, date_to: Optional[date]=None, rollup: bool=True, breakdown_type: Literal['expense', 'income']='expense', include_planned: bool=False, db: Session=None, user_id: int=None):
    if include_planned:
        ensure_family_plan(db, user_id)
    main = accounts_svc.get_user_main_currency(db, user_id)
    df, dt, label = resolve_period(period, year, month, quarter, date_from, date_to)

    transactions_query = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_family_expense.is_(False),
            func.date(Transaction.date) >= df,
            func.date(Transaction.date) <= dt,
        )
    )
    if not include_planned:
        transactions_query = transactions_query.filter(Transaction.is_planned.is_(False))
    transactions = transactions_query.all()

    breakdown_enum = (
        TransactionType.income if breakdown_type == "income" else TransactionType.expense
    )

    period_totals = financial_period_totals(
        db, user_id, df, dt, main,
        include_planned=include_planned,
        category_type=breakdown_enum,
    )
    total_income = period_totals.income
    total_expense = period_totals.expense
    cat_totals = period_totals.expense_categories or {}

    # Знаменатель для процентов — сумма по выбранному типу
    breakdown_total = total_income if breakdown_type == "income" else total_expense

    categories_map = {
        c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }

    def _node(cat_id: Optional[int], total: float, own: float, children: list) -> CategoryBreakdown:
        cat = categories_map.get(cat_id) if cat_id else None
        percent = round((total / breakdown_total * 100), 1) if breakdown_total > 0 else 0.0
        return CategoryBreakdown(
            category_id=cat_id,
            category_name=cat.name if cat else "Без категории",
            category_color=cat.color if cat else "#94a3b8",
            category_icon=cat.icon if cat else None,
            total=round(total, 2),
            own_total=round(own, 2),
            percent=percent,
            children=children,
        )

    if rollup:
        # Группируем суммы по корневой категории. Каждая корневая хранит:
        #  - own_total (сумма транзакций на самой корневой)
        #  - children (агрегаты по подкатегориям)
        roots: dict[Optional[int], dict] = {}  # root_id -> {"own": x, "children": {child_id: amount}}
        for cat_id, amount in cat_totals.items():
            cat = categories_map.get(cat_id) if cat_id else None
            if cat is None:
                bucket = roots.setdefault(None, {"own": 0.0, "children": {}})
                bucket["own"] += amount
                continue
            if cat.parent_id and cat.parent_id in categories_map:
                root_id = cat.parent_id
                bucket = roots.setdefault(root_id, {"own": 0.0, "children": {}})
                bucket["children"][cat.id] = bucket["children"].get(cat.id, 0.0) + amount
            else:
                bucket = roots.setdefault(cat.id, {"own": 0.0, "children": {}})
                bucket["own"] += amount

        # Превращаем в CategoryBreakdown-узлы
        nodes: list[CategoryBreakdown] = []
        for root_id, data in roots.items():
            children_amount = sum(data["children"].values())
            root_total = data["own"] + children_amount
            child_nodes = []
            for child_id, child_amount in sorted(data["children"].items(), key=lambda x: x[1], reverse=True):
                child_nodes.append(_node(child_id, child_amount, child_amount, []))
            nodes.append(_node(root_id, root_total, data["own"], child_nodes))
        nodes.sort(key=lambda n: n.total, reverse=True)
        breakdown = nodes
    else:
        breakdown = [
            _node(cat_id, total, total, [])
            for cat_id, total in sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)
        ]

    return SummaryResponse(
        main_currency=main,
        period_label=label,
        date_from=df,
        date_to=dt,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net=round(total_income - total_expense, 2),
        transactions_count=len(transactions),
        category_breakdown=breakdown,
        top_5=breakdown[:5],
    )


def get_monthly_trend(months: int=6, include_planned: bool=False, end_date: Optional[date]=None, db: Session=None, user_id: int=None):
    if include_planned:
        ensure_family_plan(db, user_id)
    main = accounts_svc.get_user_main_currency(db, user_id)
    # График должен следовать за выбранным на сводке периодом, а не всегда
    # заканчиваться текущим месяцем. Внутри месяца считаем полный календарный
    # месяц — это делает сравнение столбцов предсказуемым.
    reference = end_date or datetime.now(timezone.utc).date()

    start_year = reference.year
    start_month = reference.month - (months - 1)
    while start_month <= 0:
        start_month += 12
        start_year -= 1
    start_date = date(start_year, start_month, 1)

    # Загружаем сырые транзакции (нельзя SUM в SQL — валюты разные)
    transactions_query = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_family_expense.is_(False),
            func.date(Transaction.date) >= start_date,
        )
    )
    if not include_planned:
        transactions_query = transactions_query.filter(Transaction.is_planned.is_(False))
    transactions = transactions_query.all()

    # Заполняем все месяцы нулями
    points_map: dict[str, dict] = {}
    y, m = start_year, start_month
    for _ in range(months):
        key = f"{y:04d}-{m:02d}"
        label = RU_MONTHS[m].capitalize()
        if months > 12:
            label = f"{RU_MONTHS[m][:3].capitalize()}. {y}"
        points_map[key] = {
            "month": key,
            "label": label,
            "income": 0.0,
            "expense": 0.0,
        }
        m += 1
        if m > 12:
            m = 1
            y += 1

    for t in transactions:
        if t.is_financing:
            continue
        key = f"{t.date.year:04d}-{t.date.month:02d}"
        if key not in points_map:
            continue
        amt = _to_main(db, user_id, t.amount, t.currency, main, transaction=t)
        if t.type == TransactionType.income:
            points_map[key]["income"] += amt
        elif t.type == TransactionType.expense:
            points_map[key]["expense"] += amt

    points = [
        MonthlyTrendPoint(
            month=p["month"],
            label=p["label"],
            income=round(p["income"], 2),
            expense=round(p["expense"], 2),
            net=round(p["income"] - p["expense"], 2),
        )
        for p in sorted(points_map.values(), key=lambda x: x["month"])
    ]

    return MonthlyTrendResponse(main_currency=main, months=months, points=points)
