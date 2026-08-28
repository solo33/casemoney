"""One canonical future-events feed for the dashboard and calendars.

Planning used to compose this information in several places.  A recurring
operation could consequently be shown both as a schedule and as a generated
planned transaction.  Keeping the projection here gives every surface the
same, de-duplicated view.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy.orm import Session

from app.models.credit import CreditObligation
from app.models.recurring_transaction import RecurringTransaction, RecurringTransactionRun
from app.models.transaction import Transaction, TransactionType


def _deposit_income(item: CreditObligation) -> float | None:
    """Estimated next deposit interest, without changing the balance."""
    if item.kind != "deposit":
        return item.monthly_payment
    if item.annual_interest_rate is None:
        return item.monthly_payment
    principal = float(item.current_balance or item.original_amount or 0)
    rate = float(item.annual_interest_rate) / 100
    if item.interest_payout_frequency == "maturity":
        start = item.opened_at or date.today()
        finish = item.end_date or item.next_payment_date or start
        return round(principal * rate * max(1, (finish - start).days) / 365, 2)
    return round(principal * rate / 12, 2)


def _as_type(value: TransactionType | str) -> str:
    return value.value if isinstance(value, TransactionType) else str(value)


def list_upcoming_events(db: Session, user_id: int, start: date, end: date) -> list[dict]:
    """Return one future-event record per event source in the requested range.

    ``end`` is exclusive.  A generated recurring planned transaction owns its
    occurrence; the underlying recurring schedule is not emitted again for the
    same date.
    """
    start_at = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_at = datetime.combine(end, time.min, tzinfo=timezone.utc)
    events: list[dict] = []

    planned = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_planned.is_(True),
        Transaction.date >= start_at,
        Transaction.date < end_at,
    ).all()
    for item in planned:
        event_type = _as_type(item.type)
        events.append({
            "id": f"planned-{item.id}", "source": "planned", "date": item.date.date(),
            "type": event_type, "title": item.description or ("Плановый доход" if event_type == "income" else "Плановый расход"),
            "amount": float(item.amount), "currency": item.currency, "recurring": False,
            "account_id": item.account_id, "category_id": item.category_id,
        })

    generated_occurrences = {
        (run.recurring_transaction_id, run.scheduled_for)
        for run in db.query(RecurringTransactionRun).filter(
            RecurringTransactionRun.status == "planned",
            RecurringTransactionRun.scheduled_for >= start,
            RecurringTransactionRun.scheduled_for < end,
        ).all()
    }
    schedules = db.query(RecurringTransaction).filter(
        RecurringTransaction.user_id == user_id,
        RecurringTransaction.is_active.is_(True),
        RecurringTransaction.next_date >= start,
        RecurringTransaction.next_date < end,
    ).all()
    for item in schedules:
        if (item.id, item.next_date) in generated_occurrences:
            continue
        event_type = _as_type(item.type)
        events.append({
            "id": f"recurring-{item.id}-{item.next_date.isoformat()}", "source": "recurring", "date": item.next_date,
            "type": event_type, "title": item.name, "amount": float(item.amount), "currency": item.currency,
            "recurring": True, "frequency": item.frequency, "description": item.description or "",
            "account_id": item.account_id, "category_id": item.category_id,
        })

    obligations = db.query(CreditObligation).filter(
        CreditObligation.user_id == user_id,
        CreditObligation.status == "active",
        CreditObligation.next_payment_date.isnot(None),
        CreditObligation.next_payment_date >= start,
        CreditObligation.next_payment_date < end,
    ).all()
    for item in obligations:
        # A deposit configured to create a planned interest entry is already
        # represented in the first part of this feed. Emitting the obligation
        # as well would duplicate it on the dashboard and in calendars.
        if item.kind == "deposit" and item.planned_interest_transaction_id:
            continue
        is_income = item.kind == "deposit" or item.direction == "receivable"
        amount = _deposit_income(item) if item.kind == "deposit" else item.monthly_payment
        events.append({
            "id": f"obligation-{item.id}-{item.next_payment_date.isoformat()}", "source": "obligation", "date": item.next_payment_date,
            "type": "income" if is_income else "expense", "title": item.name, "amount": float(amount or 0),
            "currency": item.currency, "recurring": False, "kind": item.kind,
            "account_id": item.linked_account_id if is_income else item.source_account_id,
            "category_id": item.category_id,
            "description": "Поступление по депозиту" if item.kind == "deposit" else "Ближайший платёж по обязательству",
        })

    return sorted(events, key=lambda item: (item["date"], item["source"], item["id"]))
