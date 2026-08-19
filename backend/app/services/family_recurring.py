"""Detection helpers for repeatable common family expenses.

The detector intentionally errs on the side of silence: it only returns a
pattern after at least three similarly named shared expenses form a stable
weekly, monthly or yearly cadence.  It never looks at private operations.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from statistics import median

from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.family_recurring_suggestion import FamilyRecurringSuggestionDecision
from app.models.transaction import Transaction, TransactionType
from app.services.recurring_transactions import _next_occurrence


_FREQUENCIES = (
    ("weekly", "раз в неделю", 5, 9),
    ("monthly", "раз в месяц", 24, 38),
    ("yearly", "раз в год", 330, 400),
)


def _day(value: datetime) -> date:
    return value.date()


def _normalise_description(value: str) -> str:
    return " ".join(value.casefold().strip().split())


def _fingerprint(family_id: int, description: str, currency: str, frequency: str) -> str:
    raw = f"{family_id}|{description}|{currency.upper()}|{frequency}"
    return sha256(raw.encode("utf-8")).hexdigest()


def _future_occurrence(last_day: date, frequency: str, today: date) -> date:
    result = _next_occurrence(last_day, frequency)
    while result < today:
        result = _next_occurrence(result, frequency)
    return result


def find_family_recurring_suggestions(
    db: Session,
    family_id: int,
    current_user_id: int,
    *,
    include_resolved: bool = False,
    today: date | None = None,
) -> list[dict]:
    """Return high-confidence recurring patterns from common expenses only."""
    today = today or datetime.now(timezone.utc).date()
    # Three yearly occurrences need almost three years of history.  This also
    # covers users whose monthly payment was temporarily skipped.
    since = datetime.combine(today - timedelta(days=1150), datetime.min.time(), tzinfo=timezone.utc)
    rows = db.query(Transaction).filter(
        Transaction.family_id == family_id,
        Transaction.is_family_expense.is_(True),
        Transaction.is_planned.is_(False),
        Transaction.type == TransactionType.expense,
        Transaction.date >= since,
    ).order_by(Transaction.date.asc(), Transaction.id.asc()).all()

    categories = dict(db.query(Category.id, Category.name).all())
    groups: dict[tuple[str, str], list[Transaction]] = defaultdict(list)
    for item in rows:
        description = _normalise_description(item.description or "")
        if description:
            groups[(description, item.currency.upper())].append(item)

    resolved = set()
    if not include_resolved:
        resolved = {
            value[0]
            for value in db.query(FamilyRecurringSuggestionDecision.fingerprint).filter(
                FamilyRecurringSuggestionDecision.family_id == family_id
            ).all()
        }

    suggestions: list[dict] = []
    for (description, currency), items in groups.items():
        if len(items) < 3:
            continue
        days = [_day(item.date) for item in items]
        intervals = [(later - earlier).days for earlier, later in zip(days, days[1:])]
        if len(intervals) < 2:
            continue

        detected = next(
            (
                (frequency, label)
                for frequency, label, low, high in _FREQUENCIES
                if sum(low <= interval <= high for interval in intervals) >= len(intervals)
            ),
            None,
        )
        if not detected:
            continue
        frequency, frequency_label = detected
        amounts = [item.amount for item in items]
        average = sum(amounts) / len(amounts)
        # A fixed household payment may grow a little, but a wildly varying
        # set of purchases must not be mistaken for a subscription.
        if average <= 0 or (max(amounts) - min(amounts)) / average > 0.40:
            continue

        fingerprint = _fingerprint(family_id, description, currency, frequency)
        if fingerprint in resolved:
            continue
        last = items[-1]
        previous = items[-2]
        change = last.amount - previous.amount
        suggestions.append({
            "fingerprint": fingerprint,
            "description": last.description.strip() if last.description else description,
            "frequency": frequency,
            "frequency_label": frequency_label,
            "currency": currency,
            "amount": round(last.amount, 2),
            "average_amount": round(average, 2),
            "previous_amount": round(previous.amount, 2),
            "change_amount": round(change, 2),
            "change_percent": round(change / previous.amount * 100, 1) if previous.amount else None,
            "occurrences": len(items),
            "last_date": days[-1],
            "next_date": _future_occurrence(days[-1], frequency, today),
            "account_id": last.account_id,
            "category_id": last.category_id,
            "category_name": categories.get(last.category_id),
            "reimbursement_amount": round(last.reimbursement_amount or 0, 2),
            "paid_by_user_id": last.user_id,
            "can_create": last.user_id == current_user_id,
        })
    return sorted(suggestions, key=lambda item: (item["next_date"], item["description"].casefold()))
