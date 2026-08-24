from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.recurring_transaction import RecurringTransaction, RecurringTransactionRun
from app.models.transaction import Transaction, TransactionType
from app.services import accounts as accounts_svc
from app.models.user import User
from app.services.notifications import notify_user


def next_occurrence(value: date, frequency: str, custom_interval_days: int | None = None) -> date:
    if frequency == "custom":
        return value + timedelta(days=custom_interval_days or 1)
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


# Kept for backward-compatible imports and focused date arithmetic tests.
def _next_occurrence(value: date, frequency: str) -> date:
    return next_occurrence(value, frequency)


def _post_transaction(db: Session, schedule: RecurringTransaction, due_date: date) -> Transaction:
    """Create a real income/expense from a schedule and update its balance."""
    transaction = Transaction(
        user_id=schedule.user_id,
        type=schedule.type,
        amount=schedule.amount,
        currency=schedule.currency,
        account_id=schedule.account_id,
        category_id=schedule.category_id,
        description=schedule.description or schedule.name,
        date=datetime.combine(due_date, time(12, 0), tzinfo=timezone.utc),
        is_planned=False,
        family_id=schedule.family_id,
        is_family_expense=schedule.is_family_expense,
        reimbursement_amount=schedule.reimbursement_amount,
    )
    db.add(transaction)
    db.flush()
    balance = accounts_svc.get_or_create_balance(db, schedule.account_id, schedule.currency)
    if schedule.type == TransactionType.income:
        balance.balance += schedule.amount
    else:
        balance.balance -= schedule.amount
    return transaction


def _remind_before_due(db: Session, schedule: RecurringTransaction, today: date) -> None:
    if not schedule.reminder_days:
        return
    if schedule.next_date != today + timedelta(days=schedule.reminder_days):
        return
    user = db.query(User).filter(User.id == schedule.user_id).first()
    if user:
        notify_user(
            db, user, event="planned_operation",
            title=f"Скоро операция: {schedule.name}",
            message=(f"Через {schedule.reminder_days} дн. — {schedule.next_date.strftime('%d.%m.%Y')}: "
                     f"{schedule.amount:g} {schedule.currency}."),
            link="/planning",
        )


def process_recurring_transactions(db: Session, today: date | None = None) -> int:
    """Generate planned operations for every due recurrence and notify its owner.

    Generated records remain planned: they do not affect balances until a person
    confirms them from the planning page. This avoids surprise financial writes.
    """
    today = today or date.today()
    count = 0
    schedules = db.query(RecurringTransaction).filter(
        RecurringTransaction.is_active.is_(True),
    ).all()
    for schedule in schedules:
        if schedule.end_date and schedule.next_date > schedule.end_date:
            schedule.is_active = False
            continue
        _remind_before_due(db, schedule, today)
        if schedule.next_date > today:
            continue
        due_date = schedule.next_date
        known_run = db.query(RecurringTransactionRun).filter(
            RecurringTransactionRun.recurring_transaction_id == schedule.id,
            RecurringTransactionRun.scheduled_for == due_date,
        ).first()
        if not known_run:
            if schedule.execution_mode == "automatic":
                created = _post_transaction(db, schedule, due_date)
                status = "posted"
            else:
                created = Transaction(
                    user_id=schedule.user_id,
                    type=schedule.type,
                    amount=schedule.amount,
                    currency=schedule.currency,
                    account_id=schedule.account_id,
                    category_id=schedule.category_id,
                    description=schedule.description or schedule.name,
                    date=datetime.combine(due_date, time(12, 0), tzinfo=timezone.utc),
                    is_planned=True,
                    family_id=schedule.family_id,
                    is_family_expense=schedule.is_family_expense,
                    reimbursement_amount=schedule.reimbursement_amount,
                )
                db.add(created)
                db.flush()
                status = "planned"
            db.add(RecurringTransactionRun(
                recurring_transaction_id=schedule.id,
                scheduled_for=due_date,
                status=status,
                transaction_id=created.id,
            ))
            user = db.query(User).filter(User.id == schedule.user_id).first()
            if user:
                notify_user(
                    db, user, event="planned_operation",
                    title=(f"Проведена операция: {schedule.name}" if status == "posted" else f"Запланирована операция: {schedule.name}"),
                    message=(f"{due_date.strftime('%d.%m.%Y')} операция на {schedule.amount:g} {schedule.currency} "
                             f"{'учтена в остатке.' if status == 'posted' else 'добавлена в план.'}"),
                    link="/planning",
                )
            schedule.last_generated_for = due_date
            count += 1
        while schedule.next_date <= today:
            schedule.next_date = next_occurrence(schedule.next_date, schedule.frequency, schedule.custom_interval_days)
        if schedule.end_date and schedule.next_date > schedule.end_date:
            schedule.is_active = False
    if schedules:
        db.commit()
    return count
