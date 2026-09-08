"""Recurring_transactions: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.recurring_transaction import RecurringTransaction, RecurringTransactionRun
from app.models.transaction import TransactionType
from app.schemas.recurring_transaction import RecurringTransactionCreate, RecurringTransactionUpdate
from app.services.plans import ensure_family_plan
from app.operations.recurring_transactions.common import _get_recurring, _validate_refs


def create_recurring_transaction(data: RecurringTransactionCreate, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    if not data.account_id:
        raise ApplicationError(status_code=400, detail="Для регулярной операции выберите счёт")
    if data.frequency == "custom" and not data.custom_interval_days:
        raise ApplicationError(status_code=400, detail="Укажите интервал повторения в днях")
    if data.end_date and data.end_date < data.next_date:
        raise ApplicationError(status_code=400, detail="Дата окончания не может быть раньше первого повторения")
    _validate_refs(db, user_id, data.account_id, data.category_id)
    result = RecurringTransaction(
        user_id=user_id, name=data.name.strip(), type=TransactionType[data.type], amount=data.amount,
        currency=data.currency.upper(), account_id=data.account_id, category_id=data.category_id,
        description=data.description, frequency=data.frequency, next_date=data.next_date,
        custom_interval_days=data.custom_interval_days if data.frequency == "custom" else None,
        execution_mode=data.execution_mode, reminder_days=data.reminder_days, end_date=data.end_date,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def update_recurring_transaction(recurring_id: int, data: RecurringTransactionUpdate, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    result = db.query(RecurringTransaction).filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == user_id).first()
    if not result:
        raise ApplicationError(status_code=404, detail="Регулярная операция не найдена")
    changes = data.model_dump(exclude_unset=True)
    frequency = changes.get("frequency", result.frequency)
    custom_interval_days = changes.get("custom_interval_days", result.custom_interval_days)
    if frequency == "custom" and not custom_interval_days:
        raise ApplicationError(status_code=400, detail="Укажите интервал повторения в днях")
    next_date = changes.get("next_date", result.next_date)
    end_date = changes.get("end_date", result.end_date)
    if end_date and end_date < next_date:
        raise ApplicationError(status_code=400, detail="Дата окончания не может быть раньше следующего повторения")
    _validate_refs(db, user_id, changes.get("account_id", result.account_id), changes.get("category_id", result.category_id))
    for field, value in changes.items():
        setattr(result, field, value.strip() if field == "name" else value.upper() if field == "currency" else value)
    db.commit()
    db.refresh(result)
    return result


def skip_next_recurring_transaction(recurring_id: int, db: Session=None, user_id: int=None):
    """Skip only the nearest occurrence and retain the rest of the schedule."""
    ensure_family_plan(db, user_id)
    result = _get_recurring(db, user_id, recurring_id)
    if not result.is_active:
        raise ApplicationError(status_code=400, detail="Сначала включите регулярную операцию")
    db.add(RecurringTransactionRun(recurring_transaction_id=result.id, scheduled_for=result.next_date, status="skipped"))
    from app.services.recurring_transactions import next_occurrence
    result.last_generated_for = result.next_date
    result.next_date = next_occurrence(result.next_date, result.frequency, result.custom_interval_days)
    db.commit()
    db.refresh(result)
    return result


def finish_recurring_transaction(recurring_id: int, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    result = _get_recurring(db, user_id, recurring_id)
    result.is_active = False
    db.commit()
    db.refresh(result)
    return result


def delete_recurring_transaction(recurring_id: int, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    result = db.query(RecurringTransaction).filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == user_id).first()
    if not result:
        raise ApplicationError(status_code=404, detail="Регулярная операция не найдена")
    db.delete(result)
    db.commit()
