"""Recurring_transactions: common. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.category import Category
from app.models.recurring_transaction import RecurringTransaction



def _validate_refs(db: Session, user_id: int, account_id: int | None, category_id: int | None) -> None:
    if account_id and not db.query(Account.id).filter(Account.id == account_id, Account.user_id == user_id).first():
        raise ApplicationError(status_code=404, detail="Счёт не найден")
    if category_id and not db.query(Category.id).filter(Category.id == category_id, Category.user_id == user_id).first():
        raise ApplicationError(status_code=404, detail="Категория не найдена")


def _get_recurring(db: Session, user_id: int, recurring_id: int) -> RecurringTransaction:
    result = db.query(RecurringTransaction).filter(RecurringTransaction.id == recurring_id, RecurringTransaction.user_id == user_id).first()
    if not result:
        raise ApplicationError(status_code=404, detail="Регулярная операция не найдена")
    return result
