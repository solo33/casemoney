import uuid
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models.category import Category
from app.models.account_group import AccountGroup
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.transaction import Transaction, TransactionType
from app.models.transaction_history import TransactionHistory
from app.models.user_currency import UserCurrency
from app.models.user import User
from app.constants import DEFAULT_CATEGORIES
from app.services.auth import hash_password


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


def seed_demo_user(db: Session):
    """Создаёт/пересоздаёт статический демо-аккаунт test@test.com.

    Только для локальной разработки — вызов гейтится переменной окружения
    в app/main.py (см. SEED_STATIC_DEMO). На проде публичное демо теперь
    выдаётся через отдельный, изолированный на сессию аккаунт — см.
    create_ephemeral_demo_user().
    """
    # Uvicorn runs the startup hook in every worker. On PostgreSQL, let only
    # one worker rebuild the demo data to avoid concurrent DELETE/INSERT races.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        acquired = db.execute(
            text("SELECT pg_try_advisory_xact_lock(:lock_id)"),
            {"lock_id": 0x434153454D4F4E45},  # "CASEMONE"
        ).scalar()
        if not acquired:
            return

    user = db.query(User).filter(User.email == "test@test.com").first()
    if user is None:
        user = User(email="test@test.com", username="test", hashed_password=hash_password("test12345"))
        db.add(user)
        db.flush()
    user.hashed_password = hash_password("test12345")
    user.email_verified = True
    user.is_active = True
    user.main_currency = "RUB"
    db.flush()

    _wipe_user_data(db, user.id)
    _build_demo_dataset(db, user)
    db.commit()


def create_ephemeral_demo_user(db: Session) -> User:
    """Создаёт изолированный одноразовый демо-аккаунт (кнопка «Заполнить
    демо-вход» на публичном логине). Каждый посетитель получает свою
    песочницу — никто не видит и не может изменить данные другого. Аккаунт
    удаляется фоновым воркером через DEMO_ACCOUNT_TTL после создания —
    см. app/services/demo_cleanup.py.
    """
    token = uuid.uuid4().hex[:12]
    user = User(
        email=f"demo-{token}@demo.casemoney.local",
        username="Гость",
        hashed_password=hash_password(uuid.uuid4().hex),  # логин только по токену, не по паролю
        email_verified=True,
        is_active=True,
        main_currency="RUB",
        is_demo=True,
    )
    db.add(user)
    db.flush()
    _build_demo_dataset(db, user)
    db.commit()
    db.refresh(user)
    return user


def _wipe_user_data(db: Session, user_id: int) -> None:
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()]
    if account_ids:
        db.query(TransactionHistory).filter(TransactionHistory.user_id == user_id).delete(synchronize_session=False)
        db.query(Transaction).filter(Transaction.user_id == user_id).delete(synchronize_session=False)
        db.query(AccountBalance).filter(AccountBalance.account_id.in_(account_ids)).delete(synchronize_session=False)
        db.query(Account).filter(Account.user_id == user_id).delete(synchronize_session=False)
    db.query(Category).filter(Category.user_id == user_id).delete(synchronize_session=False)
    db.query(AccountGroup).filter(AccountGroup.user_id == user_id).delete(synchronize_session=False)
    db.query(UserCurrency).filter(UserCurrency.user_id == user_id).delete(synchronize_session=False)
    db.flush()


def _build_demo_dataset(db: Session, user: User) -> None:
    """Наполняет пустой аккаунт каноничным демо-набором: категории, группы
    счетов, счета, транзакции. Предполагает, что для user.id ещё нет данных
    (для test@test.com это гарантирует _wipe_user_data)."""
    income_names = [
        "Зарплата", "Аванс", "Премия", "Фриланс", "Консультации",
        "Проценты по вкладу", "Кэшбэк", "Возврат", "Подарки", "Продажа вещей",
        "Инвестиции", "Дивиденды", "Аренда", "Подработка", "Маркетплейс",
        "Крипто", "Перевод от семьи", "Компенсация", "Бонус", "Другое",
    ]
    expense_names = [
        "Продукты", "Кафе", "Транспорт", "Автомобиль", "Дом",
        "Коммунальные", "Связь", "Здоровье", "Одежда", "Развлечения",
        "Подарки", "Путешествия", "Образование", "Подписки",
    ]
    cats = [
        *[Category(user_id=user.id, name=name, type="income", icon="↗", color="#167a4a", is_default=True) for name in income_names],
        *[Category(user_id=user.id, name=name, type="expense", icon="↘", color="#c0432b", is_default=True) for name in expense_names],
    ]
    db.add_all(cats)
    db.flush()
    cat = {c.name: c for c in cats}

    groups = [
        AccountGroup(user_id=user.id, name="Повседневные", sort_order=0),
        AccountGroup(user_id=user.id, name="Накопления", sort_order=1),
        AccountGroup(user_id=user.id, name="Инвестиции", sort_order=2),
    ]
    db.add_all(groups)
    db.flush()

    card = Account(user_id=user.id, name="Основная карта", type="card", icon="💳", group_id=groups[0].id, sort_order=0, include_in_balance=True)
    cash = Account(user_id=user.id, name="Наличные", type="cash", icon="💵", group_id=groups[0].id, sort_order=1, include_in_balance=True)
    credit = Account(user_id=user.id, name="Кредитная карта", type="card", icon="💳", group_id=groups[0].id, sort_order=2, include_in_balance=True)
    savings = Account(user_id=user.id, name="Накопительный счёт", type="bank", icon="🏦", group_id=groups[1].id, sort_order=0, include_in_balance=True)
    deposit = Account(user_id=user.id, name="Вклад", type="bank", icon="🏦", group_id=groups[1].id, sort_order=1, include_in_balance=True)
    broker = Account(user_id=user.id, name="Брокерский счёт", type="bank", icon="📈", group_id=groups[2].id, sort_order=0, include_in_balance=True)
    crypto = Account(user_id=user.id, name="Криптокошелёк", type="crypto", icon="₿", group_id=groups[2].id, sort_order=1, include_in_balance=True)
    db.add_all([card, cash, credit, savings, deposit, broker, crypto])
    db.flush()

    balances = {
        card.id: AccountBalance(account_id=card.id, currency="RUB", balance=0),
        cash.id: AccountBalance(account_id=cash.id, currency="RUB", balance=0),
        credit.id: AccountBalance(account_id=credit.id, currency="RUB", balance=0),
        savings.id: AccountBalance(account_id=savings.id, currency="RUB", balance=0),
        deposit.id: AccountBalance(account_id=deposit.id, currency="RUB", balance=0),
        broker.id: AccountBalance(account_id=broker.id, currency="RUB", balance=0),
        crypto.id: AccountBalance(account_id=crypto.id, currency="RUB", balance=0),
    }
    db.add_all(balances.values())
    db.flush()

    def add_tx(day: str, account: Account, tx_type: TransactionType, amount: float, category: Category | None, description: str, to_account: Account | None = None):
        tx = Transaction(
            user_id=user.id,
            account_id=account.id,
            to_account_id=to_account.id if to_account else None,
            to_amount=amount if to_account else None,
            to_currency="RUB" if to_account else None,
            category_id=category.id if category else None,
            type=tx_type,
            amount=amount,
            currency="RUB",
            description=description,
            date=datetime.fromisoformat(day).replace(tzinfo=timezone.utc),
        )
        db.add(tx)
        if tx_type == TransactionType.income:
            balances[account.id].balance += amount
        elif tx_type == TransactionType.expense:
            balances[account.id].balance -= amount
        elif tx_type == TransactionType.transfer and to_account:
            balances[account.id].balance -= amount
            balances[to_account.id].balance += amount

    demo_rows = []
    for i, name in enumerate(income_names):
        account = card if i % 3 else savings
        amount = [145000, 70000, 30000, 18000, 12000, 4500, 3200, 7600, 10000, 15000][i % 10]
        month = 1 + (i % 6)
        day = 2 + (i % 24)
        demo_rows.append((f"2026-{month:02d}-{day:02d}", account, TransactionType.income, amount, cat[name], name, None))
    expenses = [
        ("2026-06-02", card, 5600, "Продукты", "Продукты на неделю"),
        ("2026-06-03", card, 1850, "Транспорт", "Такси и метро"),
        ("2026-06-04", credit, 12400, "Одежда", "Обувь"),
        ("2026-06-05", card, 32000, "Дом", "Аренда"),
        ("2026-06-06", cash, 2400, "Кафе", "Ужин"),
        ("2026-06-07", card, 1150, "Связь", "Мобильная связь"),
        ("2026-06-08", card, 4700, "Здоровье", "Аптека"),
        ("2026-06-09", card, 1990, "Подписки", "Музыка и облако"),
        ("2026-06-10", card, 12800, "Коммунальные", "Коммунальные платежи"),
        ("2026-06-11", cash, 3600, "Развлечения", "Кино и кафе"),
        ("2026-05-18", card, 17500, "Продукты", "Месячные покупки"),
        ("2026-04-12", card, 42000, "Путешествия", "Билеты"),
    ]
    # Начальное пополнение наличных (снятие с карты) — чтобы баланс cash был положительным
    demo_rows.append(("2026-01-01", card, TransactionType.transfer, 15000, None, "Наличные на месяц", cash))
    demo_rows.extend((d, a, TransactionType.expense, amount, cat[cat_name], desc, None) for d, a, amount, cat_name, desc in expenses)
    demo_rows.extend([
        ("2026-06-05", card, TransactionType.transfer, 45000, None, "В накопления", savings),
        ("2026-06-15", savings, TransactionType.transfer, 100000, None, "На вклад", deposit),
        ("2026-06-16", card, TransactionType.transfer, 600, None, "Покупка BTC", crypto),
        ("2026-06-17", card, TransactionType.transfer, 500, None, "Пополнение брокера", broker),
    ])
    for row in demo_rows:
        add_tx(*row)
    db.flush()
