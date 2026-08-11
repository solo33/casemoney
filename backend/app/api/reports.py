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
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.account_group import AccountGroup
from app.services.auth import decode_token
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc
from app.services.plans import ensure_family_plan

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


class BalanceAccountRow(BaseModel):
    account_id: int
    name: str
    icon: Optional[str]
    monthly: List[float]   # остаток на конец каждого из 12 месяцев, в main


class BalanceGroupRow(BaseModel):
    group_id: Optional[int]
    group_name: str
    monthly: List[float]   # сумма остатков счетов группы по месяцам
    accounts: List[BalanceAccountRow]


class AnnualBalancesResponse(BaseModel):
    main_currency: str
    year: int
    groups: List[BalanceGroupRow]
    total_monthly: List[float]   # остаток по всем счетам на конец каждого месяца


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
    include_planned: bool = Query(False),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if include_planned:
        ensure_family_plan(db, user_id)
    main = accounts_svc.get_user_main_currency(db, user_id)
    df, dt, label = resolve_period(period, year, month, quarter, date_from, date_to)

    transactions_query = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
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

    total_income = 0.0
    total_expense = 0.0
    cat_totals: dict[Optional[int], float] = {}
    for t in transactions:
        if t.is_financing:
            continue
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
        if t.is_financing:
            continue
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


@router.get("/annual-balances", response_model=AnnualBalancesResponse)
def get_annual_balances(
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    ensure_family_plan(db, user_id)
    """Остаток каждого счёта на конец каждого месяца года, в основной валюте.

    На баланс влияют только доходы (+) и расходы (−); переводы — ноль.
    Остаток на конец месяца M = текущий баланс − эффект всех операций после конца M.
    """
    main = accounts_svc.get_user_main_currency(db, user_id)

    accounts = (
        db.query(Account)
        .filter(Account.user_id == user_id)
        .order_by(Account.sort_order, Account.id)
        .all()
    )
    if not accounts:
        return AnnualBalancesResponse(main_currency=main, year=year, groups=[], total_monthly=[0.0] * 12)

    account_ids = [a.id for a in accounts]

    # Текущие балансы по (account_id, currency)
    balances = db.query(AccountBalance).filter(AccountBalance.account_id.in_(account_ids)).all()
    current: dict[tuple[int, str], float] = {}
    currencies_by_acc: dict[int, set[str]] = {}
    for b in balances:
        current[(b.account_id, b.currency)] = b.balance
        currencies_by_acc.setdefault(b.account_id, set()).add(b.currency)

    # Эффекты операций: помесячно внутри года + суммарно «после года»
    # effect = +amount (доход), -amount (расход), 0 (перевод)
    month_eff: dict[tuple[int, str], list[float]] = {}   # (acc,cur) -> [12]
    future_eff: dict[tuple[int, str], float] = {}        # (acc,cur) -> сумма после 31.12.year

    year_start = date(year, 1, 1)
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            func.date(Transaction.date) >= year_start,
        )
        .all()
    )
    for t in txs:
        if t.type == TransactionType.income:
            eff = t.amount
        elif t.type == TransactionType.expense:
            eff = -t.amount
        else:
            continue  # перевод не меняет баланс
        key = (t.account_id, t.currency)
        currencies_by_acc.setdefault(t.account_id, set()).add(t.currency)
        if t.date.year == year:
            arr = month_eff.setdefault(key, [0.0] * 12)
            arr[t.date.month - 1] += eff
        else:  # год больше запрошенного → «будущее» относительно конца года
            future_eff[key] = future_eff.get(key, 0.0) + eff

    def eom_series_in_currency(acc_id: int, cur: str) -> list[float]:
        """12 значений остатка (в валюте cur) на конец каждого месяца."""
        cur_balance = current.get((acc_id, cur), 0.0)
        meff = month_eff.get((acc_id, cur), [0.0] * 12)
        feff = future_eff.get((acc_id, cur), 0.0)
        out = [0.0] * 12
        out[11] = cur_balance - feff               # конец декабря
        for m in range(10, -1, -1):                # ноябрь ... январь
            out[m] = out[m + 1] - meff[m + 1]
        return out

    # Группы (для порядка и названий)
    groups = (
        db.query(AccountGroup)
        .filter(AccountGroup.user_id == user_id)
        .order_by(AccountGroup.sort_order, AccountGroup.id)
        .all()
    )
    group_order: list[tuple[Optional[int], str]] = [(g.id, g.name) for g in groups]
    group_order.append((None, "Без группы"))

    accounts_by_group: dict[Optional[int], list[Account]] = {}
    for a in accounts:
        accounts_by_group.setdefault(a.group_id, []).append(a)

    total_monthly = [0.0] * 12
    group_rows: list[BalanceGroupRow] = []

    for gid, gname in group_order:
        bucket = accounts_by_group.get(gid, [])
        if not bucket:
            continue
        acc_rows: list[BalanceAccountRow] = []
        group_monthly = [0.0] * 12
        for a in bucket:
            monthly_main = [0.0] * 12
            for cur in currencies_by_acc.get(a.id, set()):
                series = eom_series_in_currency(a.id, cur)
                for m in range(12):
                    monthly_main[m] += _to_main(db, user_id, series[m], cur, main)
            monthly_main = [round(v, 2) for v in monthly_main]
            acc_rows.append(BalanceAccountRow(
                account_id=a.id, name=a.name, icon=a.icon, monthly=monthly_main,
            ))
            for m in range(12):
                group_monthly[m] += monthly_main[m]
        group_monthly = [round(v, 2) for v in group_monthly]
        for m in range(12):
            total_monthly[m] += group_monthly[m]
        group_rows.append(BalanceGroupRow(
            group_id=gid, group_name=gname, monthly=group_monthly, accounts=acc_rows,
        ))

    return AnnualBalancesResponse(
        main_currency=main,
        year=year,
        groups=group_rows,
        total_monthly=[round(v, 2) for v in total_monthly],
    )


@router.get("/monthly-trend", response_model=MonthlyTrendResponse)
def get_monthly_trend(
    months: int = Query(6, ge=1, le=24),
    include_planned: bool = Query(False),
    end_date: Optional[date] = Query(
        None,
        description="Последний месяц графика; по умолчанию текущий месяц",
    ),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


# --- Сравнение год к году ---

class YoyRow(BaseModel):
    month: int                 # 1..12
    label: str                 # "Январь"
    values: dict[int, float]   # год → сумма в main_currency


class YoyResponse(BaseModel):
    main_currency: str
    type: str                  # income | expense
    years: List[int]
    rows: List[YoyRow]         # всегда 12 строк-месяцев
    totals: dict[int, float]   # год → сумма за год


def _parse_ids(csv: Optional[str]) -> Optional[set[int]]:
    if not csv:
        return None
    out = set()
    for part in csv.split(","):
        part = part.strip()
        if part.isdigit():
            out.add(int(part))
    return out or None


@router.get("/yoy", response_model=YoyResponse)
def get_yoy(
    type: Literal["income", "expense"] = Query("expense"),
    account_ids: Optional[str] = Query(None, description="CSV id счетов"),
    category_ids: Optional[str] = Query(None, description="CSV id категорий (вкл. подкатегории)"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Сравнение год к году: строки — месяцы, колонки — все годы с данными.

    Фильтры по счетам и категориям опциональны; для категорий автоматически
    включаются подкатегории выбранных.
    """
    ensure_family_plan(db, user_id)
    main = accounts_svc.get_user_main_currency(db, user_id)
    tx_type = TransactionType[type]

    query = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.type == tx_type,
        Transaction.is_financing.is_(False),
    )

    acc_ids = _parse_ids(account_ids)
    if acc_ids:
        query = query.filter(Transaction.account_id.in_(acc_ids))

    cat_ids = _parse_ids(category_ids)
    if cat_ids:
        # Разворачиваем в подкатегории (иерархия у категорий 2 уровня)
        all_cats = db.query(Category).filter(Category.user_id == user_id).all()
        expanded = set(cat_ids)
        for c in all_cats:
            if c.parent_id in cat_ids:
                expanded.add(c.id)
        query = query.filter(Transaction.category_id.in_(expanded))

    agg: dict[tuple[int, int], float] = {}
    for t in query.all():
        key = (t.date.year, t.date.month)
        agg[key] = agg.get(key, 0.0) + _to_main(db, user_id, t.amount, t.currency, main)

    years = sorted({y for y, _ in agg})
    rows = [
        YoyRow(
            month=m,
            label=RU_MONTHS[m].capitalize(),
            values={y: round(agg.get((y, m), 0.0), 2) for y in years},
        )
        for m in range(1, 13)
    ]
    totals = {
        y: round(sum(agg.get((y, m), 0.0) for m in range(1, 13)), 2)
        for y in years
    }
    return YoyResponse(main_currency=main, type=type, years=years, rows=rows, totals=totals)
