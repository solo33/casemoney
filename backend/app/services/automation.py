"""Small, deterministic transaction automation helpers.

Rules only fill an empty category.  They never rewrite an explicitly chosen
category, so the user remains in full control of historic data.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from app.models.account import Account
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.transaction import Transaction, TransactionType


def normalize_rule_pattern(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def matched_category_id(
    db,
    user_id: int,
    description: str | None,
    category_type: str,
) -> int | None:
    text = normalize_rule_pattern(description or "")
    if not text:
        return None
    rules = (
        db.query(CategoryRule)
        .join(Category, Category.id == CategoryRule.category_id)
        .filter(
            CategoryRule.user_id == user_id,
            CategoryRule.is_active.is_(True),
            Category.user_id == user_id,
            Category.type == category_type,
        )
        .all()
    )
    # Prefer the most specific matching phrase: "пятёрочка доставка" wins
    # over a generic "пятёрочка".
    matches = [rule for rule in rules if rule.pattern in text]
    if not matches:
        return None
    return max(matches, key=lambda item: len(item.pattern)).category_id


def suggest_category_from_history(
    db,
    user_id: int,
    description: str | None,
    category_type: str,
) -> dict | None:
    """Suggest one category without changing any transaction.

    A saved rule wins because it is an explicit instruction.  Without a rule,
    only operations with the same normalized description are considered.  This
    keeps a suggestion understandable and avoids guessing from unrelated text.
    """
    note = normalize_rule_pattern(description or "")
    if len(note) < 2:
        return None

    rule_category_id = matched_category_id(db, user_id, note, category_type)
    if rule_category_id is not None:
        category = db.query(Category).filter(
            Category.id == rule_category_id,
            Category.user_id == user_id,
        ).first()
        if category:
            return {
                "category_id": category.id,
                "category_name": category.name,
                "category_type": category.type,
                "source": "rule",
                "confidence": 1.0,
                "matching_operations": 1,
            }

    rows = (
        db.query(Transaction.category_id, Transaction.description)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType(category_type),
            Transaction.is_planned.is_(False),
            Transaction.category_id.isnot(None),
            Transaction.description.isnot(None),
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(1000)
        .all()
    )
    matching_ids = [
        row.category_id
        for row in rows
        if normalize_rule_pattern(row.description or "") == note
    ]
    if not matching_ids:
        return None
    counts: dict[int, int] = {}
    for category_id in matching_ids:
        counts[category_id] = counts.get(category_id, 0) + 1
    category_id, uses = max(counts.items(), key=lambda item: item[1])
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user_id,
        Category.type == category_type,
    ).first()
    if not category:
        return None
    return {
        "category_id": category.id,
        "category_name": category.name,
        "category_type": category.type,
        "source": "history",
        "confidence": round(uses / len(matching_ids), 2),
        "matching_operations": uses,
    }


def regular_payment_suggestions(db, user_id: int, limit: int = 12) -> list[dict]:
    """Find conservative weekly/monthly payment candidates without creating anything.

    A candidate needs at least three real, non-financing income/expense
    operations with the same account, currency, rounded amount and note.  The
    intervals must be consistently weekly or monthly.  This intentionally
    favours a short, trustworthy list over speculative suggestions.
    """
    rows = (
        db.query(Transaction, Account)
        .join(Account, Account.id == Transaction.account_id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type.in_([TransactionType.income, TransactionType.expense]),
            Transaction.is_planned.is_(False),
            Transaction.is_financing.is_(False),
        )
        .order_by(Transaction.date.asc(), Transaction.id.asc())
        .all()
    )
    buckets: dict[tuple, list[tuple[Transaction, Account]]] = defaultdict(list)
    for transaction, account in rows:
        note = normalize_rule_pattern(transaction.description or "")
        if len(note) < 2:
            continue
        key = (
            transaction.type.value,
            transaction.account_id,
            transaction.currency,
            round(float(transaction.amount), 2),
            transaction.category_id,
            note,
        )
        buckets[key].append((transaction, account))

    result: list[dict] = []
    for key, values in buckets.items():
        if len(values) < 3:
            continue
        transactions = [value[0] for value in values]
        intervals = [
            (later.date.date() - earlier.date.date()).days
            for earlier, later in zip(transactions, transactions[1:])
        ]
        cadence = None
        if intervals and all(5 <= interval <= 9 for interval in intervals):
            cadence, delta = "еженедельно", 7
        elif intervals and all(26 <= interval <= 35 for interval in intervals):
            cadence, delta = "ежемесячно", 30
        else:
            continue
        last = transactions[-1]
        account = values[-1][1]
        result.append({
            "key": "|".join(map(str, key)),
            "transaction_type": last.type.value,
            "description": last.description or "Регулярная операция",
            "account_id": account.id,
            "account_name": account.name,
            "category_id": last.category_id,
            "amount": last.amount,
            "currency": last.currency,
            "cadence": cadence,
            "occurrences": len(transactions),
            "last_date": last.date.date().isoformat(),
            "next_date": (last.date.date() + timedelta(days=delta)).isoformat(),
        })
    return sorted(result, key=lambda item: (-item["occurrences"], item["next_date"]))[:limit]
