"""Reports: annual. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from typing import List, Optional, Literal
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.account_group import AccountGroup
from app.services import accounts as accounts_svc
from app.services.plans import ensure_family_plan
from app.operations.reports.common import _parse_ids, _to_main, RU_MONTHS
from app.schemas.reports_views import AnnualBalancesResponse, AnnualReport, AnnualRow, BalanceAccountRow, BalanceGroupRow, YoyResponse, YoyRow


def get_annual(year: int=..., db: Session=None, user_id: int=None):
    """Годовой анализ: матрица 'категория x месяц', доходы и расходы.

    Категории идут плоско, но в порядке parent -> children -> next parent.
    Родительские суммы = own + сумма дочерних (per month).
    """
    main = accounts_svc.get_user_main_currency(db, user_id)

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_family_expense.is_(False),
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
        amount = _to_main(db, user_id, t.amount, t.currency, main, transaction=t)
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


def get_annual_balances(year: int=..., db: Session=None, user_id: int=None):
    """Остаток каждого счёта на конец каждого месяца года, в основной валюте.

    Доход увеличивает остаток, расход уменьшает его. Перевод не меняет
    общий капитал, но меняет оба конкретных счёта: списывает сумму со
    счёта-источника и зачисляет сумму в валюте счёта-получателя. Плановые
    операции в фактический остаток не входят.

    Остаток на конец месяца M = текущий баланс − эффект всех фактических
    операций после конца M.
    """
    ensure_family_plan(db, user_id)
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

    # Текущие балансы по (account_id, currency). Базовый остаток в текущей
    # оценке нужен только как точка отсчёта; изменения назад во времени
    # вычитаем по снимкам курсов самих операций.
    balances = db.query(AccountBalance).filter(AccountBalance.account_id.in_(account_ids)).all()
    current_main: dict[int, float] = {}
    for b in balances:
        current_main[b.account_id] = current_main.get(b.account_id, 0.0) + _to_main(
            db, user_id, b.balance, b.currency, main
        )

    # Эффекты операций: помесячно внутри года + суммарно «после года».
    # У перевода две стороны: −amount на источнике и +to_amount на получателе.
    month_eff: dict[int, list[float]] = {}   # account -> [12] в основной валюте
    future_eff: dict[int, float] = {}        # сумма после 31.12.year

    year_start = date(year, 1, 1)
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            func.date(Transaction.date) >= year_start,
            Transaction.is_planned.is_(False),
        )
        .all()
    )

    def add_effect(account_id: int, effect: float, occurred_at: datetime) -> None:
        """Сохраняет изменение одного баланса в нужном месяце или будущем периоде."""
        if occurred_at.year == year:
            arr = month_eff.setdefault(account_id, [0.0] * 12)
            arr[occurred_at.month - 1] += effect
        else:  # год больше запрошенного → «будущее» относительно конца года
            future_eff[account_id] = future_eff.get(account_id, 0.0) + effect

    for t in txs:
        if t.type == TransactionType.income:
            add_effect(t.account_id, _to_main(db, user_id, t.amount, t.currency, main, transaction=t), t.date)
        elif t.type == TransactionType.expense:
            add_effect(t.account_id, -_to_main(db, user_id, t.amount, t.currency, main, transaction=t), t.date)
        elif t.type == TransactionType.transfer:
            add_effect(t.account_id, -_to_main(db, user_id, t.amount, t.currency, main, transaction=t), t.date)
            if t.to_account_id and t.to_currency and t.to_amount is not None:
                add_effect(
                    t.to_account_id,
                    _to_main(db, user_id, t.to_amount, t.to_currency, main, transaction=t, destination=True),
                    t.date,
                )

    def eom_series(acc_id: int) -> list[float]:
        """12 значений остатка на конец каждого месяца в основной валюте."""
        cur_balance = current_main.get(acc_id, 0.0)
        meff = month_eff.get(acc_id, [0.0] * 12)
        feff = future_eff.get(acc_id, 0.0)
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
            monthly_main = [round(v, 2) for v in eom_series(a.id)]
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


def get_yoy(type: Literal['income', 'expense']='expense', account_ids: Optional[str]=None, category_ids: Optional[str]=None, db: Session=None, user_id: int=None):
    """Сравнение год к году: строки — месяцы, колонки — все годы с данными.

    Фильтры по счетам и категориям опциональны; для категорий автоматически
    включаются подкатегории выбранных.
    """
    ensure_family_plan(db, user_id)
    main = accounts_svc.get_user_main_currency(db, user_id)
    tx_type = TransactionType[type]

    query = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_family_expense.is_(False),
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
        agg[key] = agg.get(key, 0.0) + _to_main(db, user_id, t.amount, t.currency, main, transaction=t)

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
