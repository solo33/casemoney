from calendar import monthrange
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

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

PERIOD = "month"  # v1 поддерживает только месячные бюджеты


def current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def require_family(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
) -> int:
    ensure_family_plan(db, user_id)
    return user_id


def _month_range(anchor: date) -> tuple[date, date]:
    """Первый и последний день месяца (обе границы включительно)."""
    start = anchor.replace(day=1)
    end = anchor.replace(day=monthrange(anchor.year, anchor.month)[1])
    return start, end


def _months_back(anchor: date, count: int) -> date:
    month = anchor.month - count
    year = anchor.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _own_category(db: Session, user_id: int, category_id: int) -> Category:
    category = db.query(Category).filter(
        Category.id == category_id, Category.user_id == user_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    if category.type != "expense":
        raise HTTPException(status_code=400, detail="Бюджет можно задать только для категории расходов")
    return category


def _spent_for_category(db: Session, user_id: int, category_id: int, currency: str, start: date, end: date) -> float:
    rows = db.query(Transaction.amount, Transaction.currency).filter(
        Transaction.user_id == user_id,
        Transaction.category_id == category_id,
        Transaction.type == TransactionType.expense,
        Transaction.is_planned.is_(False),
        func.date(Transaction.date) >= start,
        func.date(Transaction.date) <= end,
    ).all()
    return round(sum(convert_for_user(db, user_id, amount, tx_currency, currency) for amount, tx_currency in rows), 2)


def _serialize(db: Session, budget: Budget, category: Category, start: date, end: date) -> BudgetResponse:
    spent = _spent_for_category(db, budget.user_id, budget.category_id, budget.currency, start, end)
    remaining = round(budget.amount - spent, 2)
    percent = round(min(999, spent / budget.amount * 100), 1) if budget.amount else 0
    return BudgetResponse(
        id=budget.id,
        category_id=budget.category_id,
        category_name=category.name,
        category_icon=category.icon,
        period=budget.period,
        amount=budget.amount,
        currency=budget.currency,
        spent=spent,
        remaining=remaining,
        percent=percent,
        is_overspent=spent > budget.amount,
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )


@router.get("/", response_model=list[BudgetResponse])
def list_budgets(
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    start, end = _month_range(date.today())

    budgets = db.query(Budget).filter(
        Budget.user_id == user_id, Budget.period == PERIOD
    ).order_by(Budget.id).all()
    categories = {
        c.id: c for c in db.query(Category).filter(
            Category.id.in_([b.category_id for b in budgets])
        ).all()
    }
    return [
        _serialize(db, b, categories[b.category_id], start, end)
        for b in budgets if b.category_id in categories
    ]


@router.get("/suggestions", response_model=list[BudgetSuggestion])
def budget_suggestions(
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    """Средний расход по категориям без бюджета за последние 6 месяцев — подсказка для лимита."""
    main_currency = accounts_svc.get_user_main_currency(db, user_id)
    today = date.today()
    since = _months_back(today, 6)
    prev_month_end = today.replace(day=1) - timedelta(days=1)

    already_budgeted = {
        row[0] for row in db.query(Budget.category_id).filter(
            Budget.user_id == user_id, Budget.period == PERIOD
        ).all()
    }

    rows = db.query(Transaction.category_id, Transaction.amount, Transaction.currency, Transaction.date).filter(
        Transaction.user_id == user_id,
        Transaction.type == TransactionType.expense,
        Transaction.is_planned.is_(False),
        Transaction.category_id.isnot(None),
        func.date(Transaction.date) >= since,
        func.date(Transaction.date) <= prev_month_end,
    ).all()

    by_category: dict[int, dict] = {}
    for category_id, amount, currency, tx_date in rows:
        if category_id in already_budgeted:
            continue
        bucket = by_category.setdefault(category_id, {"total": 0.0, "months": set()})
        bucket["total"] += convert_for_user(db, user_id, amount, currency, main_currency)
        bucket["months"].add((tx_date.year, tx_date.month))

    if not by_category:
        return []

    categories = {
        c.id: c for c in db.query(Category).filter(Category.id.in_(by_category.keys())).all()
    }
    suggestions = []
    for category_id, bucket in by_category.items():
        category = categories.get(category_id)
        if not category:
            continue
        months = len(bucket["months"]) or 1
        suggestions.append(BudgetSuggestion(
            category_id=category_id,
            category_name=category.name,
            category_icon=category.icon,
            average_amount=round(bucket["total"] / months, 2),
            currency=main_currency,
            months_with_data=months,
        ))
    suggestions.sort(key=lambda s: s.average_amount, reverse=True)
    return suggestions


@router.post("/", response_model=BudgetResponse, status_code=201)
def create_budget(
    data: BudgetCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    category = _own_category(db, user_id, data.category_id)
    existing = db.query(Budget).filter(
        Budget.user_id == user_id, Budget.category_id == data.category_id, Budget.period == PERIOD
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Бюджет для этой категории уже задан")

    budget = Budget(
        user_id=user_id, category_id=data.category_id, period=PERIOD,
        amount=data.amount, currency=data.currency,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    start, end = _month_range(date.today())
    return _serialize(db, budget, category, start, end)


@router.patch("/{budget_id}", response_model=BudgetResponse)
def update_budget(
    budget_id: int,
    data: BudgetUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Бюджет не найден")
    budget.amount = data.amount
    db.commit()
    db.refresh(budget)
    category = db.query(Category).filter(Category.id == budget.category_id).first()
    start, end = _month_range(date.today())
    return _serialize(db, budget, category, start, end)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Бюджет не найден")
    db.delete(budget)
    db.commit()
