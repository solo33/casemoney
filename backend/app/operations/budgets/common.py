"""Budgets: common. Callers supply resolved user and database session."""
from calendar import monthrange
from datetime import date, timedelta
from app.application import ApplicationError
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session
from app.services.family_context import accounting_rows_query, active_membership
from app.models.family import FamilyExpenseAccounting
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.schemas.budget import BudgetResponse
from app.services.exchange import convert_for_user, convert_transaction_for_user



PERIODS = {"month", "quarter", "year"}


ROLLOVER_MODES = {"none", "carry_remaining", "carry_balance"}


SCOPES = {"personal", "family", "mixed"}


def _period_start(anchor: date, period: str) -> date:
    if period == "month":
        return anchor.replace(day=1)
    if period == "quarter":
        return anchor.replace(month=((anchor.month - 1) // 3) * 3 + 1, day=1)
    if period == "year":
        return anchor.replace(month=1, day=1)
    raise ApplicationError(status_code=400, detail="Неподдерживаемый период бюджета")


def _period_range(anchor: date, period: str) -> tuple[date, date]:
    start = _period_start(anchor, period)
    if period == "month":
        return start, start.replace(day=monthrange(start.year, start.month)[1])
    if period == "quarter":
        end_month = start.month + 2
        return start, date(start.year, end_month, monthrange(start.year, end_month)[1])
    return start, date(start.year, 12, 31)


def _previous_period_start(start: date, period: str) -> date:
    if period == "month":
        return (start - timedelta(days=1)).replace(day=1)
    if period == "quarter":
        return _period_start(start - timedelta(days=1), "quarter")
    return date(start.year - 1, 1, 1)


def _own_category(db: Session, user_id: int, category_id: int) -> Category:
    category = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
    if not category:
        raise ApplicationError(status_code=404, detail="Категория не найдена")
    if category.type != "expense":
        raise ApplicationError(status_code=400, detail="Бюджет можно задать только для категории расходов")
    return category


def _category_tree_ids(db: Session, user_id: int, category_id: int) -> set[int]:
    """Return a category and all of its descendants (the UI permits two levels)."""
    categories = db.query(Category.id, Category.parent_id).filter(
        Category.user_id == user_id,
        Category.type == "expense",
    ).all()
    children: dict[int, list[int]] = {}
    for item_id, parent_id in categories:
        if parent_id is not None:
            children.setdefault(parent_id, []).append(item_id)

    ids = {category_id}
    queue = [category_id]
    while queue:
        current = queue.pop()
        for child_id in children.get(current, []):
            if child_id not in ids:
                ids.add(child_id)
                queue.append(child_id)
    return ids


def _transaction_scope_filter(db: Session, user_id: int, scope: str):
    if scope == "personal":
        return and_(
            Transaction.user_id == user_id,
            Transaction.is_family_expense.is_(False),
        )

    membership = active_membership(db, user_id)
    family_id = membership.family_id if membership else None
    if family_id is None:
        raise ApplicationError(
            status_code=400,
            detail="Сначала создайте семейное пространство или выберите личный бюджет",
        )
    accepted_ids = accounting_rows_query(db, family_id).filter(
        FamilyExpenseAccounting.status == "accepted"
    ).with_entities(FamilyExpenseAccounting.source_transaction_id)
    family_expenses = Transaction.id.in_(accepted_ids)
    if scope == "family":
        return family_expenses
    return or_(
        and_(Transaction.user_id == user_id, Transaction.is_family_expense.is_(False),
             Transaction.id.notin_(db.query(FamilyExpenseAccounting.owner_transaction_id).filter(
                 FamilyExpenseAccounting.family_id == family_id,
                 FamilyExpenseAccounting.status == "accepted",
                 FamilyExpenseAccounting.owner_transaction_id.isnot(None),
             ))),
        family_expenses,
    )


def _related_category_ids(db: Session, user_id: int, category_id: int) -> set[int]:
    """A budget is set either for a group or for its children, never both."""
    categories = db.query(Category.id, Category.parent_id).filter(
        Category.user_id == user_id,
        Category.type == "expense",
    ).all()
    parents = {item_id: parent_id for item_id, parent_id in categories}
    related = _category_tree_ids(db, user_id, category_id)
    parent_id = parents.get(category_id)
    while parent_id is not None:
        related.add(parent_id)
        parent_id = parents.get(parent_id)
    return related


def _spent_for_category(
    db: Session,
    user_id: int,
    category_id: int,
    currency: str,
    start: date,
    end: date,
    include_planned: bool,
    scope: str,
) -> float:
    category_ids = _category_tree_ids(db, user_id, category_id)
    mapped_category = select(FamilyExpenseAccounting.owner_category_id).where(
        FamilyExpenseAccounting.source_transaction_id == Transaction.id,
        FamilyExpenseAccounting.status == "accepted",
    ).correlate(Transaction).scalar_subquery()
    effective_category = func.coalesce(mapped_category, Transaction.category_id) if scope != "personal" else Transaction.category_id
    query = db.query(Transaction).filter(
        _transaction_scope_filter(db, user_id, scope),
        effective_category.in_(category_ids),
        Transaction.type == TransactionType.expense,
        func.date(Transaction.date) >= start,
        func.date(Transaction.date) <= end,
    )
    if not include_planned:
        query = query.filter(Transaction.is_planned.is_(False))
    rows = query.all()
    return round(sum(convert_transaction_for_user(db, user_id, row, currency) for row in rows), 2)


def _budget_state(db: Session, budget: Budget) -> tuple[float, float, float]:
    """Возвращает (spent, carry_in, remaining) для периода этого бюджета.

    Единственное место, где считается "потрачено / перенесено / остаток" —
    и `_carry_in` (остаток предыдущего периода, который может перетечь
    дальше), и `_serialize` (ответ API) берут значения отсюда, а не
    пересчитывают формулу каждый по-своему.
    """
    start, end = _period_range(budget.period_start, budget.period)
    spent = _spent_for_category(
        db, budget.user_id, budget.category_id, budget.currency,
        start, end, budget.include_planned, budget.scope,
    )
    carry_in = _carry_in(db, budget)
    remaining = round(budget.amount + carry_in - spent, 2)
    return spent, carry_in, remaining


def _carry_in(db: Session, budget: Budget) -> float:
    """Calculate a rollover chain iteratively, without recursive API work.

    A long-running monthly budget used to recurse through every prior period.
    Besides risking a recursion limit, rendering several budgets repeated the
    same queries.  Here each historic period is evaluated exactly once, from
    oldest to newest; a missing period intentionally breaks the chain.
    """
    previous_start = _previous_period_start(budget.period_start, budget.period)
    rows = db.query(Budget).filter(
        Budget.user_id == budget.user_id,
        Budget.category_id == budget.category_id,
        Budget.period == budget.period,
        Budget.period_start < budget.period_start,
    ).order_by(Budget.period_start.asc()).all()
    by_start = {row.period_start: row for row in rows}

    chain: list[Budget] = []
    cursor = previous_start
    while cursor in by_start:
        chain.append(by_start[cursor])
        cursor = _previous_period_start(cursor, budget.period)
    chain.reverse()

    carry = 0.0
    carry_currency: str | None = None
    for previous in chain:
        if carry_currency is not None:
            carry = convert_for_user(db, budget.user_id, carry, carry_currency, previous.currency)
        start, end = _period_range(previous.period_start, previous.period)
        spent = _spent_for_category(
            db, previous.user_id, previous.category_id, previous.currency,
            start, end, previous.include_planned, previous.scope,
        )
        if previous.rollover_mode == "none":
            carry = 0.0
        else:
            remainder = previous.amount + carry - spent
            carry = max(0.0, remainder) if previous.rollover_mode == "carry_remaining" else remainder
        carry_currency = previous.currency

    if not chain or carry_currency is None or chain[-1].rollover_mode == "none":
        return 0.0
    return round(convert_for_user(db, budget.user_id, carry, carry_currency, budget.currency), 2)


def _serialize(db: Session, budget: Budget, category: Category) -> BudgetResponse:
    spent, carry_in, remaining = _budget_state(db, budget)
    effective_limit = round(budget.amount + carry_in, 2)
    percent = round(min(999, spent / effective_limit * 100), 1) if effective_limit > 0 else 999
    expected_spent_to_date = None
    daily_deviation = None
    if budget.daily_amount is not None and budget.daily_amount > 0:
        start, end = _period_range(budget.period_start, budget.period)
        if date.today() < start:
            elapsed_days = 0
        elif date.today() > end:
            elapsed_days = (end - start).days + 1
        else:
            elapsed_days = (date.today() - start).days + 1
        expected_spent_to_date = round(budget.daily_amount * elapsed_days, 2)
        # Положительное значение — уже потрачено больше дневного ориентира.
        daily_deviation = round(spent - expected_spent_to_date, 2)
    return BudgetResponse(
        id=budget.id,
        category_id=budget.category_id,
        category_name=category.name,
        category_icon=category.icon,
        period=budget.period,
        period_start=budget.period_start,
        amount=budget.amount,
        effective_limit=effective_limit,
        currency=budget.currency,
        spent=spent,
        remaining=remaining,
        percent=percent,
        is_overspent=spent > effective_limit,
        rollover_mode=budget.rollover_mode,
        carry_in=carry_in,
        include_planned=budget.include_planned,
        daily_amount=budget.daily_amount,
        expected_spent_to_date=expected_spent_to_date,
        daily_deviation=daily_deviation,
        scope=budget.scope,
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )
