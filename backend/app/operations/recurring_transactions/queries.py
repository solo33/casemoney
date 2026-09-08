"""Recurring_transactions: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.models.recurring_transaction import RecurringTransaction, RecurringTransactionRun
from app.services.plans import ensure_family_plan
from app.operations.recurring_transactions.common import _get_recurring


def list_recurring_transactions(db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    return db.query(RecurringTransaction).filter(RecurringTransaction.user_id == user_id).order_by(
        RecurringTransaction.is_active.desc(), RecurringTransaction.next_date.asc(), RecurringTransaction.name.asc()
    ).all()


def recurring_transaction_runs(recurring_id: int, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    _get_recurring(db, user_id, recurring_id)
    return db.query(RecurringTransactionRun).filter(
        RecurringTransactionRun.recurring_transaction_id == recurring_id
    ).order_by(RecurringTransactionRun.scheduled_for.desc()).limit(50).all()
