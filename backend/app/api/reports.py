from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel
from calendar import monthrange

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.services.auth import decode_token
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc

router = APIRouter(prefix="/api/reports", tags=["reports"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


# --- Схемы ответа ---

class CategoryBreakdown(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: Optional[str]
    total: float                         # в main_currency (свой + дочерние при rollup)
    percent: float
    own_total: float = 0.0               # сумма транзакций, привязанных непосредственно к этой категории
    children: List["CategoryBreakdown"] = []  # подкатегории (только при rollup)

    class Config:
        from_attributes = True


CategoryBreakdown.model_rebuild()


class SummaryResponse(BaseModel):
    main_currency: str
    period_label: str
    date_from: date
    date_to: date
    total_income: float    # в main_currency
    total_expense: float   # в main_currency
    net: float             # в main_currency
    transactions_count: int
    category_breakdown: List[CategoryBreakdown]  # rolled-up tree если rollup=true, иначе flat
    top_5: List[CategoryBreakdown]               # топ-5 корневых


class MonthlyTrendPoint(BaseModel):
    month: str        # "2026-05"
    label: str        # "Май"
    income: float     # в main_currency
    expense: float    # в main_currency
    net: float        # income - expense


class MonthlyTrendResponse(BaseModel):
    main_currency: str
    months: int
    points: List[MonthlyTrendPoint]


class AnnualRow(BaseModel):
    category_id: Optional[int]
    category_name: str
    parent_id: Optional[int]      # для отступа в UI
    is_parent: bool               # для жирного выделения
    monthly: List[float]          # 12 значений в main_currency
    total: float                  # сумма за год


class AnnualReport(BaseModel):
    main_currency: str
    year: int
    income: List[AnnualRow]
    expense: List[AnnualRow]
    income_totals: List[float]    # 12 + сумма не сохраняется отдельно
    income_total: float
    expense_totals: List[float]
    expense_total: float
    net_monthly: List[float]      # income - expense по месяцам
    net_total: float


# --- Утилиты ---

RU_MONTHS = ["", "январь", "февраль", "март", "апрель", "май", "июнь",
             "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]


def _to_main(db: Session, user_id: int, amount: float, currency: str, main: str) -> float:
    try:
        return exchange_svc.convert_for_user(db, user_id, amount, currency, main)
    except exchange_svc.ExchangeError:
        return 0.0


def resolve_period(
    period: str,
    year: Optional[int],
    month: Optional[int],
    quarter: Optional[int],
    date_from: Optional[date],
    date_to: Optional[date],
) -> tuple[date, date, str]:
    now = datetime.now(timezone.utc)
    y = year or now.year

    if period == "month":
        m = month or now.month
        if not 1 <= m <= 12:
            raise HTTPException(status_code=400, detail="month должен быть 1..12")
        last_day = monthrange(y, m)[1]
        return date(y, m, 1), date(y, m, last_day), f"{RU_MONTHS[m].capitalize()} {y}"

    if period == "quarter":
        q = quarter or ((now.month - 1) // 3 + 1)
        if not 1 <= q <= 4:
            raise HTTPException(status_code=400, detail="quarter должен быть 1..4")
        start_month = (q - 1) * 3 + 1
        end_month = start_month + 2
        last_day = monthrange(y, end_month)[1]
        return date(y, start_month, 1), date(y, end_month, last_day), f"{q} квартал {y}"

    if period == "year":
        return date(y, 1, 1), date(y, 12, 31), f"{y} год"

    if period == "custom":
        if not date_from or not date_to:
            raise HTTPException(status_code=400, detail="date_from и date_to обязательны для custom")
        if date_from > date_to:
            raise HTTPException(status_code=400, detail="date_from > date_to")
        return date_from, date_to, f"{date_from.strftime('%d.%m.%Y')} — {date_to.strftime('%d.%m.%Y')}"

    raise HTTPException(status_code=400, detail=f"Неизвестный period: {period}")


# --- Эндпоинты ---

@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    period: Literal["month", "quarter", "year", "custom"] = Query("month"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    quarter: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    rollup: bool = Query(True, description="Сворачивать подкатегории под родителя"),
    breakdown_type: Literal["expense", "income"] = Query(
        "expense", description="По какому типу строить разбивку по категориям"
    ),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    main = accounts_svc.get_user_main_currency(db, user_id)
    df, dt, label = resolve_period(period, year, month, quarter, date_from, date_to)

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            func.date(Transaction.date) >= df,
            func.date(Transaction.date) <= dt,
        )
        .all()
    )

    breakdown_enum = (
        TransactionType.income if breakdown_type == "income" else TransactionType.expense
    )

    total_income = 0.0
    total_expense = 0.0
    cat_totals: dict[Optional[int], float] = {}
    for t in transactions:
        amount_main = _to_main(db, user_id, t.amount, t.currency, main)
        if t.type == TransactionType.income:
            total_income += amount_main
        elif t.type == TransactionType.expense:
            total_expense += amount_main
        # Разбивка по категориям — по выбранному типу (доход или расход)
        if t.type == breakdown_enum:
            cat_totals[t.category_id] = cat_totals.get(t.category_id, 0.0) + amount_main

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


@router.get("/annual", response_model=AnnualReport)
def get_annual(
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Годовой анализ: матрица 'категория x месяц', доходы и расходы.

    Категории идут плоско, но в порядке parent -> children -> next parent.
    Родительские суммы = own + сумма дочерних (per month).
    """
    main = accounts_svc.get_user_main_currency(db, user_id)

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            func.date(Transaction.date) >= date(year, 1, 1),
            func.date(Transaction.date) <= date(year, 12, 31),
        )
        .all()
    )

    categories_map = {
        c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }

    # Группируем: (cat_id, month) -> sum_in_main, отдельно для income/expense
    inc_buckets: dict[Optional[int], list[float]] = {}
    exp_buckets: dict[Optional[int], list[float]] = {}
    for t in transactions:
        if t.type not in (TransactionType.income, TransactionType.expense):
            continue
        m_idx = t.date.month - 1
        amount = _to_main(db, user_id, t.amount, t.currency, main)
        bucket = inc_buckets if t.type == TransactionType.income else exp_buckets
        if t.category_id not in bucket:
            bucket[t.category_id] = [0.0] * 12
        bucket[t.category_id][m_idx] += amount

    def build_rows(buckets: dict[Optional[int], list[float]], cat_type: str) -> List[AnnualRow]:
        """Иерархия: root -> children. Родителю суммируются amounts детей."""
        # Идентификаторы участвующих категорий + их родителей
        involved_ids = set(buckets.keys()) - {None}
        for cid in list(involved_ids):
            cat = categories_map.get(cid)
            if cat and cat.parent_id:
                involved_ids.add(cat.parent_id)

        # Берём все корневые этого типа, у которых есть данные (own или children)
        roots = []
        for c in categories_map.values():
            if c.type != cat_type:
                continue
            if c.parent_id:
                continue
            if c.id in involved_ids:
                roots.append(c)
        roots.sort(key=lambda x: x.name.lower())

        # Дети каждой корневой
        children_map: dict[int, list] = {}
        for c in categories_map.values():
            if c.parent_id and c.parent_id in {r.id for r in roots} and c.id in involved_ids:
                children_map.setdefault(c.parent_id, []).append(c)
        for lst in children_map.values():
            lst.sort(key=lambda x: x.name.lower())

        rows: list[AnnualRow] = []
        for root in roots:
            own = buckets.get(root.id, [0.0] * 12)
            kids = children_map.get(root.id, [])

            # Сумма по месяцам = own + сумма всех children
            total_monthly = list(own)
            for ch in kids:
                ch_monthly = buckets.get(ch.id, [0.0] * 12)
                for i in range(12):
                    total_monthly[i] += ch_monthly[i]

            rows.append(AnnualRow(
                category_id=root.id,
                category_name=root.name,
                parent_id=None,
                is_parent=True,
                monthly=[round(v, 2) for v in total_monthly],
                total=round(sum(total_monthly), 2),
            ))
            for ch in kids:
                ch_monthly = buckets.get(ch.id, [0.0] * 12)
                rows.append(AnnualRow(
                    category_id=ch.id,
                    category_name=ch.name,
                    parent_id=root.id,
                    is_parent=False,
                    monthly=[round(v, 2) for v in ch_monthly],
                    total=round(sum(ch_monthly), 2),
                ))

        # Транзакции без категории
        if None in buckets:
            monthly = buckets[None]
            rows.append(AnnualRow(
                category_id=None,
                category_name="Без категории",
                parent_id=None,
                is_parent=True,
                monthly=[round(v, 2) for v in monthly],
                total=round(sum(monthly), 2),
            ))

        return rows

    income_rows = build_rows(inc_buckets, "income")
    expense_rows = build_rows(exp_buckets, "expense")

    # Итоги по месяцам — сумма только корневых (children уже включены)
    inc_totals = [0.0] * 12
    for r in income_rows:
        if r.is_parent:
            for i in range(12):
                inc_totals[i] += r.monthly[i]
    exp_totals = [0.0] * 12
    for r in expense_rows:
        if r.is_parent:
            for i in range(12):
                exp_totals[i] += r.monthly[i]

    net_monthly = [round(inc_totals[i] - exp_totals[i], 2) for i in range(12)]

    return AnnualReport(
        main_currency=main,
        year=year,
        income=income_rows,
        expense=expense_rows,
        income_totals=[round(v, 2) for v in inc_totals],
        income_total=round(sum(inc_totals), 2),
        expense_totals=[round(v, 2) for v in exp_totals],
        expense_total=round(sum(exp_totals), 2),
        net_monthly=net_monthly,
        net_total=round(sum(net_monthly), 2),
    )


@router.get("/monthly-trend", response_model=MonthlyTrendResponse)
def get_monthly_trend(
    months: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    main = accounts_svc.get_user_main_currency(db, user_id)
    now = datetime.now(timezone.utc)

    start_year = now.year
    start_month = now.month - (months - 1)
    while start_month <= 0:
        start_month += 12
        start_year -= 1
    start_date = date(start_year, start_month, 1)

    # Загружаем сырые транзакции (нельзя SUM в SQL — валюты разные)
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            func.date(Transaction.date) >= start_date,
        )
        .all()
    )

    # Заполняем все месяцы нулями
    points_map: dict[str, dict] = {}
    y, m = start_year, start_month
    for _ in range(months):
        key = f"{y:04d}-{m:02d}"
        points_map[key] = {
            "month": key,
            "label": RU_MONTHS[m].capitalize(),
            "income": 0.0,
            "expense": 0.0,
        }
        m += 1
        if m > 12:
            m = 1
            y += 1

    for t in transactions:
        key = f"{t.date.year:04d}-{t.date.month:02d}"
        if key not in points_map:
            continue
        amt = _to_main(db, user_id, t.amount, t.currency, main)
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
