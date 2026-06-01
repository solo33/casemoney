from sqlalchemy.orm import Session
from app.models.category import Category
from app.models.account_group import AccountGroup
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.constants import DEFAULT_CATEGORIES


def seed_default_categories(db: Session, user_id: int):
    for cat in DEFAULT_CATEGORIES:
        db.add(Category(**cat, user_id=user_id, is_default=True))
    db.commit()


# Группы и по одному счёту в каждой. Тип счёта определяет иконку/семантику.
DEFAULT_ACCOUNT_GROUPS = [
    {"name": "Наличные",        "account": {"name": "Кошелёк", "type": "cash"}},
    {"name": "Счета в банках",  "account": {"name": "Карта",   "type": "card"}},
    {"name": "Депозиты",        "account": {"name": "Вклад",   "type": "bank"}},
]


def seed_default_accounts(db: Session, user_id: int, currency: str = "RUB"):
    """Создаёт стартовые группы и по одному счёту в каждой (баланс 0)."""
    for i, grp in enumerate(DEFAULT_ACCOUNT_GROUPS):
        group = AccountGroup(user_id=user_id, name=grp["name"], sort_order=i)
        db.add(group)
        db.flush()  # нужен group.id

        acc = Account(
            user_id=user_id,
            name=grp["account"]["name"],
            type=grp["account"]["type"],
            group_id=group.id,
            sort_order=i,
            include_in_balance=True,
        )
        db.add(acc)
        db.flush()  # нужен acc.id

        db.add(AccountBalance(account_id=acc.id, currency=currency.upper(), balance=0.0))
    db.commit()
