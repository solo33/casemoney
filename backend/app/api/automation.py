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
from app.schemas.automation import CategoryRuleCreate, CategoryRuleResponse, DuplicateGroupResponse, DuplicateTransactionItem
from app.services.auth import decode_token
from app.services.automation import normalize_rule_pattern


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


@router.get("/duplicates", response_model=list[DuplicateGroupResponse])
def possible_duplicates(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    """Potential duplicates for review; nothing is deleted or merged automatically."""
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
