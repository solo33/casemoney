from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction


def _next_occurrence(value: date, frequency: str) -> date:
    if frequency == "daily":
        return value + timedelta(days=1)
    if frequency == "weekly":
        return value + timedelta(days=7)
    if frequency == "biweekly":
        return value + timedelta(days=14)
    if frequency == "yearly":
        year = value.year + 1
        day = min(value.day, monthrange(year, value.month)[1])
        return date(year, value.month, day)
    month = value.month + 1
    year = value.year
    if month == 13:
        year += 1
        month = 1
    return date(year, month, min(value.day, monthrange(year, month)[1]))


def process_recurring_transactions(db: Session, today: date | None = None) -> int:
    """Generate planned operations for every due recurrence and notify its owner.

    Generated records remain planned: they do not affect balances until a person
    confirms them from the planning page. This avoids surprise financial writes.
    """
    today = today or date.today()
    count = 0
    schedules = db.query(RecurringTransaction).filter(
        RecurringTransaction.is_active.is_(True),
        RecurringTransaction.next_date <= today,
    ).all()
    for schedule in schedules:
        due_date = schedule.next_date
        if schedule.last_generated_for != due_date:
            db.add(Transaction(
                user_id=schedule.user_id,
                type=schedule.type,
                amount=schedule.amount,
                currency=schedule.currency,
                account_id=schedule.account_id,
                category_id=schedule.category_id,
                description=schedule.description or schedule.name,
                date=datetime.combine(due_date, time(12, 0), tzinfo=timezone.utc),
                is_planned=True,
            ))
            db.add(Notification(
                user_id=schedule.user_id,
                title=f"Запланирована операция: {schedule.name}",
                message=f"{due_date.strftime('%d.%m.%Y')} добавлена плановая операция на {schedule.amount:g} {schedule.currency}.",
                link="/planning",
            ))
            schedule.last_generated_for = due_date
            count += 1
        while schedule.next_date <= today:
            schedule.next_date = _next_occurrence(schedule.next_date, schedule.frequency)
    if schedules:
        db.commit()
    return count
