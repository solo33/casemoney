"""Budgets: commands. Callers supply resolved user and database session."""
from datetime import date
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.budget import Budget
from app.schemas.budget import BudgetCreate, BudgetUpdate
from app.operations.budgets.common import _own_category, _period_start, _related_category_ids, _serialize, _transaction_scope_filter


def create_budget(data: BudgetCreate, db: Session=None, user_id: int=None):
    category = _own_category(db, user_id, data.category_id)
    start = _period_start(data.period_start or date.today(), data.period)
    existing = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.category_id.in_(_related_category_ids(db, user_id, data.category_id)),
        Budget.period == data.period, Budget.period_start == start,
    ).first()
    if existing:
        raise ApplicationError(
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


def update_budget(budget_id: int, data: BudgetUpdate, db: Session=None, user_id: int=None):
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user_id).first()
    if not budget:
        raise ApplicationError(status_code=404, detail="Бюджет не найден")
    changes = data.model_dump(exclude_unset=True)
    if "scope" in changes and changes["scope"] != "personal":
        _transaction_scope_filter(db, user_id, changes["scope"])
    for field, value in changes.items():
        setattr(budget, field, value)
    db.commit()
    db.refresh(budget)
    category = _own_category(db, user_id, budget.category_id)
    return _serialize(db, budget, category)


def delete_budget(budget_id: int, db: Session=None, user_id: int=None):
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user_id).first()
    if not budget:
        raise ApplicationError(status_code=404, detail="Бюджет не найден")
    db.delete(budget)
    db.commit()
