"""Полное удаление пользователя и его данных.

Общий хелпер для админского удаления (app/api/admin.py) и очистки
эфемерных демо-аккаунтов (app/services/demo_cleanup.py) — чтобы порядок
удаления не приходилось поддерживать в двух местах.

Таблицы, добавленные после family/billing/credits/notifications, имеют
ondelete=CASCADE на user_id и удаляются автоматически при db.delete(user).
Более старые таблицы (Transaction, AccountBalance, Account, AccountGroup,
Category, UserCurrency) такого каскада не имеют — их чистим вручную.
TransactionHistory — не FK, переживает удаление операции по дизайну, но при
удалении пользователя её тоже пора убрать.
"""
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.account_group import AccountGroup
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.transaction_history import TransactionHistory
from app.models.user import User
from app.models.user_currency import UserCurrency


def delete_user_completely(db: Session, user_id: int) -> None:
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()]
    db.query(TransactionHistory).filter(TransactionHistory.user_id == user_id).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.user_id == user_id).delete(synchronize_session=False)
    if account_ids:
        db.query(AccountBalance).filter(AccountBalance.account_id.in_(account_ids)).delete(synchronize_session=False)
    db.query(Account).filter(Account.user_id == user_id).delete(synchronize_session=False)
    db.query(AccountGroup).filter(AccountGroup.user_id == user_id).delete(synchronize_session=False)
    db.query(Category).filter(Category.user_id == user_id).delete(synchronize_session=False)
    db.query(UserCurrency).filter(UserCurrency.user_id == user_id).delete(synchronize_session=False)
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
