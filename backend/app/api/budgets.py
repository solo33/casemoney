from calendar import monthrange
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.api.family import active_membership
from app.database import get_db
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.schemas.budget import BudgetCreate, BudgetResponse, BudgetSuggestion, BudgetUpdate
from app.services import accounts as accounts_svc
from app.services.auth import decode_token
from app.services.exchange import convert_for_user
from app.services.plans import ensure_family_plan

router = APIRouter(prefix="/api/budgets", tags=["budgets"])
security = HTTPBearer()
PERIODS = {"month", "quarter", "year"}
ROLLOVER_MODES = {"none", "carry_remaining", "carry_balance"}
SCOPES = {"personal", "family", "mixed"}


def current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def require_family(db: Session = Depends(get_db), user_id: int = Depends(current_user_id)) -> int:
    ensure_family_plan(db, user_id)
    return user_id


def _period_start(anchor: date, period: str) -> date:
    if period == "month":
        return anchor.replace(day=1)
    if period == "quarter":
        return anchor.replace(month=((anchor.month - 1) // 3) * 3 + 1, day=1)
    if period == "year":
        return anchor.replace(month=1, day=1)
    raise HTTPException(status_code=400, detail="Неподдерживаемый период бюджета")


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
        raise HTTPException(status_code=404, detail="Категория не найдена")
    if category.type != "expense":
        raise HTTPException(status_code=400, detail="Бюджет можно задать только для категории расходов")
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
        return Transaction.user_id == user_id

    membership = active_membership(db, user_id)
    family_id = membership.family_id if membership else None
    if family_id is None:
        raise HTTPException(
            status_code=400,
            detail="Сначала создайте семейное пространство или выберите личный бюджет",
        )
    family_expenses = and_(
        Transaction.family_id == family_id,
        Transaction.is_family_expense.is_(True),
    )
    if scope == "family":
        return family_expenses
    return or_(Transaction.user_id == user_id, family_expenses)


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
    query = db.query(Transaction.amount, Transaction.currency).filter(
        _transaction_scope_filter(db, user_id, scope),
        Transaction.category_id.in_(category_ids),
        Transaction.type == TransactionType.expense,
        func.date(Transaction.date) >= start,
        func.date(Transaction.date) <= end,
    )
    if not include_planned:
        query = query.filter(Transaction.is_planned.is_(False))
    rows = query.all()
    return round(sum(convert_for_user(db, user_id, amount, tx_currency, currency) for amount, tx_currency in rows), 2)


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
    previous_start = _previous_period_start(budget.period_start, budget.period)
    previous = db.query(Budget).filter(
        Budget.user_id == budget.user_id,
        Budget.category_id == budget.category_id,
        Budget.period == budget.period,
        Budget.period_start == previous_start,
    ).first()
    if not previous or previous.rollover_mode == "none":
        return 0.0
    _, _, remainder = _budget_state(db, previous)
    if previous.rollover_mode == "carry_remaining":
        remainder = max(0, remainder)
    # remainder is expressed in previous.currency — convert once here so a currency
    # change between consecutive periods for the same category can't silently
    # corrupt the current period's effective_limit.
    return round(convert_for_user(db, budget.user_id, remainder, previous.currency, budget.currency), 2)


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


@router.get("/", response_model=list[BudgetResponse])
def list_budgets(
    period: str = Query("month"),
    anchor: date | None = Query(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    if period not in PERIODS:
        raise HTTPException(status_code=400, detail="Неподдерживаемый период бюджета")
    selected_start = _period_start(anchor or date.today(), period)
    budgets = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.period == period,
        Budget.period_start == selected_start,
    ).order_by(Budget.id).all()
    categories = {c.id: c for c in db.query(Category).filter(Category.id.in_([b.category_id for b in budgets])).all()}
    return [_serialize(db, budget, categories[budget.category_id]) for budget in budgets if budget.category_id in categories]


@router.get("/suggestions", response_model=list[BudgetSuggestion])
def budget_suggestions(
    period: str = Query("month"),
    anchor: date | None = Query(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    if period not in PERIODS:
        raise HTTPException(status_code=400, detail="Неподдерживаемый период бюджета")
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
    rows = db.query(Transaction.category_id, Transaction.amount, Transaction.currency, Transaction.date).filter(
        Transaction.user_id == user_id,
        Transaction.type == TransactionType.expense,
        Transaction.is_planned.is_(False),
        Transaction.category_id.isnot(None),
        func.date(Transaction.date) >= since,
        func.date(Transaction.date) <= previous_end,
    ).all()
    by_category: dict[int, dict] = {}
    for category_id, amount, currency, tx_date in rows:
        if category_id in already_budgeted:
            continue
        bucket = by_category.setdefault(category_id, {"total": 0.0, "months": set()})
        bucket["total"] += convert_for_user(db, user_id, amount, currency, main_currency)
        bucket["months"].add((tx_date.year, tx_date.month))
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


@router.post("/", response_model=BudgetResponse, status_code=201)
def create_budget(data: BudgetCreate, db: Session = Depends(get_db), user_id: int = Depends(require_family)):
    category = _own_category(db, user_id, data.category_id)
    start = _period_start(data.period_start or date.today(), data.period)
    existing = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.category_id.in_(_related_category_ids(db, user_id, data.category_id)),
        Budget.period == data.period, Budget.period_start == start,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="В этом периоде уже задан бюджет для этой категории или её группы",
        )
    if data.scope != "personal":
        _transaction_scope_filter(db, user_id, data.scope)
    budget = Budget(
        user_id=user_id, category_id=data.category_id, period=data.period, period_start=start,
        amount=data.amount, currency=data.currency.upper(), rollover_mode=data.rollover_mode,
        include_planned=data.include_planned, scope=data.scope,
        daily_amount=data.daily_amount,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return _serialize(db, budget, category)


@router.patch("/{budget_id}", response_model=BudgetResponse)
def update_budget(budget_id: int, data: BudgetUpdate, db: Session = Depends(get_db), user_id: int = Depends(require_family)):
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Бюджет не найден")
    changes = data.model_dump(exclude_unset=True)
    if "scope" in changes and changes["scope"] != "personal":
        _transaction_scope_filter(db, user_id, changes["scope"])
    for field, value in changes.items():
        setattr(budget, field, value)
    db.commit()
    db.refresh(budget)
    category = _own_category(db, user_id, budget.category_id)
    return _serialize(db, budget, category)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(get_db), user_id: int = Depends(require_family)):
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Бюджет не найден")
    db.delete(budget)
    db.commit()
