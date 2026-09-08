"""Automation: queries. Callers supply resolved user and database session."""
from datetime import datetime, timedelta, timezone
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.schemas.automation import DuplicateGroupResponse, DuplicateTransactionItem
from app.services.automation import normalize_rule_pattern, regular_payment_suggestions, suggest_category_from_history
from app.operations.automation.common import _rule_response, _settings_response


def get_settings(db: Session=None, user_id: int=None):
    user = db.query(User).filter(User.id == user_id).one()
    return _settings_response(user)


def get_rules(db: Session=None, user_id: int=None):
    rows = (
        db.query(CategoryRule, Category)
        .join(Category, Category.id == CategoryRule.category_id)
        .filter(CategoryRule.user_id == user_id, Category.user_id == user_id)
        .order_by(CategoryRule.pattern.asc())
        .all()
    )
    return [_rule_response(rule, category) for rule, category in rows]


def category_suggestion(description: str, transaction_type: str='expense', db: Session=None, user_id: int=None):
    if transaction_type not in {"income", "expense"}:
        raise ApplicationError(status_code=400, detail="Подсказка доступна только для дохода или расхода.")
    return suggest_category_from_history(db, user_id, description, transaction_type)


def possible_duplicates(db: Session=None, user_id: int=None):
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


def regular_payments(db: Session=None, user_id: int=None):
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
