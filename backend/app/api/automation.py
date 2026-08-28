"""Personal categorisation rules and a conservative duplicate review list."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.schemas.automation import (AutomationSettings, AutomationSettingsUpdate, CategoryRuleCreate, CategoryRuleResponse, CategorySuggestion, DuplicateGroupResponse, DuplicateTransactionItem, RegularPaymentSuggestion)
from app.services.auth import decode_token
from app.services.automation import normalize_rule_pattern, regular_payment_suggestions, suggest_category_from_history


router = APIRouter(prefix="/api/automation", tags=["automation"])
security = HTTPBearer()


def _current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _rule_response(rule: CategoryRule, category: Category) -> CategoryRuleResponse:
    return CategoryRuleResponse(
        id=rule.id,
        pattern=rule.pattern,
        category_id=category.id,
        category_name=category.name,
        category_type=category.type,
        is_active=rule.is_active,
    )


def _settings_response(user: User) -> AutomationSettings:
    return AutomationSettings(
        rules_enabled=bool(user.automation_rules_enabled),
        duplicates_enabled=bool(user.automation_duplicates_enabled),
    )


@router.get("/settings", response_model=AutomationSettings)
def get_settings(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    user = db.query(User).filter(User.id == user_id).one()
    return _settings_response(user)


@router.patch("/settings", response_model=AutomationSettings)
def update_settings(data: AutomationSettingsUpdate, db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    user = db.query(User).filter(User.id == user_id).one()
    if data.rules_enabled is not None:
        user.automation_rules_enabled = data.rules_enabled
    if data.duplicates_enabled is not None:
        user.automation_duplicates_enabled = data.duplicates_enabled
    db.commit()
    db.refresh(user)
    return _settings_response(user)


@router.get("/rules", response_model=list[CategoryRuleResponse])
def get_rules(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    rows = (
        db.query(CategoryRule, Category)
        .join(Category, Category.id == CategoryRule.category_id)
        .filter(CategoryRule.user_id == user_id, Category.user_id == user_id)
        .order_by(CategoryRule.pattern.asc())
        .all()
    )
    return [_rule_response(rule, category) for rule, category in rows]


@router.post("/rules", response_model=CategoryRuleResponse, status_code=201)
def create_rule(data: CategoryRuleCreate, db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    pattern = normalize_rule_pattern(data.pattern)
    if len(pattern) < 2:
        raise HTTPException(status_code=400, detail="Укажите не менее двух символов из назначения операции.")
    category = db.query(Category).filter(Category.id == data.category_id, Category.user_id == user_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена.")
    rule = CategoryRule(user_id=user_id, category_id=category.id, pattern=pattern)
    db.add(rule)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Такое правило уже есть.")
    db.refresh(rule)
    return _rule_response(rule, category)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    rule = db.query(CategoryRule).filter(CategoryRule.id == rule_id, CategoryRule.user_id == user_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено.")
    db.delete(rule)
    db.commit()


@router.get("/category-suggestion", response_model=CategorySuggestion | None)
def category_suggestion(
    description: str,
    transaction_type: str = "expense",
    db: Session = Depends(get_db),
    user_id: int = Depends(_current_user_id),
):
    if transaction_type not in {"income", "expense"}:
        raise HTTPException(status_code=400, detail="Подсказка доступна только для дохода или расхода.")
    return suggest_category_from_history(db, user_id, description, transaction_type)


@router.get("/duplicates", response_model=list[DuplicateGroupResponse])
def possible_duplicates(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    """Potential duplicates for review; nothing is deleted or merged automatically."""
    user = db.query(User).filter(User.id == user_id).one()
    if not user.automation_duplicates_enabled:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    rows = (
        db.query(Transaction, Account)
        .join(Account, Account.id == Transaction.account_id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type.in_([TransactionType.income, TransactionType.expense]),
            Transaction.is_planned.is_(False),
            Transaction.date >= cutoff,
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(2000)
        .all()
    )
    buckets: dict[tuple, list[tuple[Transaction, Account]]] = {}
    for transaction, account in rows:
        normalized_note = normalize_rule_pattern(transaction.description or "")
        # Empty notes are too weak a signal and would produce false positives.
        if not normalized_note:
            continue
        key = (
            transaction.account_id,
            transaction.type.value,
            round(float(transaction.amount), 6),
            transaction.currency,
            transaction.date.date().isoformat(),
            normalized_note,
        )
        buckets.setdefault(key, []).append((transaction, account))

    result = []
    for key, values in buckets.items():
        if len(values) < 2:
            continue
        result.append(DuplicateGroupResponse(
            key="|".join(map(str, key)),
            transactions=[DuplicateTransactionItem(
                id=transaction.id,
                date=transaction.date.date().isoformat(),
                amount=transaction.amount,
                currency=transaction.currency,
                description=transaction.description,
                account_name=account.name,
            ) for transaction, account in values],
        ))
    return result[:30]


@router.get("/regular-payments", response_model=list[RegularPaymentSuggestion])
def regular_payments(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    """Suggestions only: the user decides whether to create a schedule."""
    suggestions = regular_payment_suggestions(db, user_id)
    category_ids = {item["category_id"] for item in suggestions if item["category_id"] is not None}
    categories = {
        category.id: category.name
        for category in db.query(Category).filter(
            Category.user_id == user_id,
            Category.id.in_(category_ids),
        ).all()
    } if category_ids else {}
    for item in suggestions:
        item["category_name"] = categories.get(item["category_id"])
    return suggestions
