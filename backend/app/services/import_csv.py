"""Импорт CSV-выгрузок iHomeMoney / HomeMoney.

Формат файла (разделитель ';', десятичная запятая):
    date;account;category;total;currency;description;transfer
    03.05.2026;Тинькофф;Покупки\\Подарки;-600,00;RUB;папе листерин;

Правила:
- date: dd.mm.yyyy
- total: знак определяет направление: отрицательное = расход, положительное = доход
- category: может содержать `\\` — иерархия parent\\child (макс 2 уровня)
- transfer: если задан — это перевод (две строки на одно перемещение)
"""
import csv
import io
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.user_currency import UserCurrency
from app.models.user import User


@dataclass
class ParsedRow:
    line_no: int
    date: Optional[str]                   # ISO YYYY-MM-DD
    account: str
    category_path: Optional[str]          # как в CSV: "Покупки\\Подарки" или ""
    category_parent: Optional[str]
    category_child: Optional[str]
    amount: float                         # подписанная сумма (исходная)
    abs_amount: float
    currency: str
    description: Optional[str]
    transfer_to: Optional[str]            # имя счёта-противоположной стороны
    tx_type: str                          # "income" | "expense" | "transfer"
    error: Optional[str] = None


@dataclass
class ImportPreview:
    rows: list[ParsedRow] = field(default_factory=list)
    new_accounts: list[str] = field(default_factory=list)
    existing_accounts: list[str] = field(default_factory=list)
    new_categories: list[dict] = field(default_factory=list)   # [{path, type}]
    existing_categories: list[str] = field(default_factory=list)
    currencies_to_add: list[str] = field(default_factory=list)  # валюты не в user_currencies
    totals: dict = field(default_factory=dict)


def _parse_amount(value: str) -> float:
    """Преобразует '-600,00' → -600.0"""
    if value is None:
        return 0.0
    s = value.strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_date(value: str) -> Optional[str]:
    if not value:
        return None
    s = value.strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_csv(content: bytes) -> list[ParsedRow]:
    """Парсит сырой CSV. Возвращает список ParsedRow (включая ошибочные строки)."""
    # Пробуем UTF-8 BOM/без, затем CP1251 как fallback
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Не удалось распознать кодировку файла")

    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)
    if not rows:
        return []

    # Заголовок
    header = [h.strip().lower() for h in rows[0]]
    expected = {"date", "account", "category", "total", "currency", "description", "transfer"}
    if not expected.issubset(set(header)):
        # Возможно ещё не та структура — попытаемся всё равно по позициям
        pass

    col_idx = {name: header.index(name) for name in header}

    parsed: list[ParsedRow] = []
    for i, raw in enumerate(rows[1:], start=2):
        if not raw or all(not c.strip() for c in raw):
            continue

        def get(col: str) -> str:
            idx = col_idx.get(col)
            if idx is None or idx >= len(raw):
                return ""
            return (raw[idx] or "").strip()

        date_iso = _parse_date(get("date"))
        account = get("account")
        category_path = get("category") or ""
        amount = _parse_amount(get("total"))
        currency = (get("currency") or "RUB").upper()
        description = get("description") or None
        transfer_to = get("transfer") or None

        # Тип транзакции
        if transfer_to:
            tx_type = "transfer"
        else:
            tx_type = "expense" if amount < 0 else ("income" if amount > 0 else "expense")

        # Иерархия категории
        parent = child = None
        if category_path:
            parts = [p.strip() for p in category_path.split("\\") if p.strip()]
            if len(parts) >= 2:
                parent, child = parts[0], parts[-1]  # берём первый и последний (макс 2)
            elif len(parts) == 1:
                parent = parts[0]

        err = None
        if not date_iso:
            err = "не удалось распарсить дату"
        elif not account:
            err = "пустой счёт"
        elif amount == 0:
            err = "нулевая сумма"

        parsed.append(ParsedRow(
            line_no=i,
            date=date_iso,
            account=account,
            category_path=category_path or None,
            category_parent=parent,
            category_child=child,
            amount=amount,
            abs_amount=abs(amount),
            currency=currency,
            description=description,
            transfer_to=transfer_to,
            tx_type=tx_type,
            error=err,
        ))
    return parsed


def build_preview(db: Session, user_id: int, rows: list[ParsedRow]) -> ImportPreview:
    """Собирает сводку: что нового нужно создать, итоги."""
    existing_accounts = {
        a.name: a for a in db.query(Account).filter(Account.user_id == user_id).all()
    }
    existing_categories = {
        c.name.lower(): c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }
    existing_user_currencies = {
        uc.currency.upper() for uc in db.query(UserCurrency).filter(UserCurrency.user_id == user_id).all()
    }

    new_accounts: set[str] = set()
    seen_accounts: set[str] = set()
    new_categories: dict[str, str] = {}   # name → type
    seen_categories: set[str] = set()
    currencies: set[str] = set()
    total_income = total_expense = 0.0
    transfer_count = ok_count = err_count = 0

    for r in rows:
        if r.error:
            err_count += 1
            continue
        ok_count += 1

        currencies.add(r.currency)
        if r.account:
            if r.account in existing_accounts:
                seen_accounts.add(r.account)
            else:
                new_accounts.add(r.account)
        # Transfer counterpart account
        if r.transfer_to:
            if r.transfer_to in existing_accounts:
                seen_accounts.add(r.transfer_to)
            else:
                new_accounts.add(r.transfer_to)
            transfer_count += 1
        else:
            if r.amount < 0:
                total_expense += r.abs_amount
            else:
                total_income += r.abs_amount

        # Категории (только для не-transfer)
        if not r.transfer_to:
            cat_type = "expense" if r.amount < 0 else "income"
            for name in filter(None, [r.category_parent, r.category_child]):
                key = name.lower()
                if key in existing_categories:
                    seen_categories.add(name)
                else:
                    # Если уже планировали — оставим тип первого encounter
                    new_categories.setdefault(name, cat_type)

    p = ImportPreview()
    p.rows = rows
    p.new_accounts = sorted(new_accounts)
    p.existing_accounts = sorted(seen_accounts)
    p.new_categories = [{"name": n, "type": t} for n, t in sorted(new_categories.items())]
    p.existing_categories = sorted(seen_categories)
    p.currencies_to_add = sorted(currencies - existing_user_currencies)
    p.totals = {
        "rows_total": len(rows),
        "ok": ok_count,
        "errors": err_count,
        "transfers": transfer_count,
        "income_sum": round(total_income, 2),
        "expense_sum": round(total_expense, 2),
    }
    return p


def execute_import(db: Session, user_id: int, rows: list[ParsedRow]) -> dict:
    """Создаёт сущности и транзакции в БД. Возвращает счётчики."""
    main_currency = "RUB"
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.main_currency:
        main_currency = user.main_currency.upper()

    # Кэш существующих
    accounts_cache: dict[str, Account] = {
        a.name: a for a in db.query(Account).filter(Account.user_id == user_id).all()
    }
    categories_cache: dict[str, Category] = {
        c.name.lower(): c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }
    user_currencies_cache: set[str] = {
        uc.currency.upper() for uc in db.query(UserCurrency).filter(UserCurrency.user_id == user_id).all()
    }

    def ensure_user_currency(currency: str):
        c = currency.upper()
        if c in user_currencies_cache:
            return
        db.add(UserCurrency(user_id=user_id, currency=c, auto=True))
        user_currencies_cache.add(c)

    def ensure_account(name: str) -> Account:
        if name in accounts_cache:
            return accounts_cache[name]
        acc = Account(name=name, type="cash", user_id=user_id)
        db.add(acc)
        db.flush()
        accounts_cache[name] = acc
        return acc

    def ensure_balance(account: Account, currency: str) -> AccountBalance:
        currency = currency.upper()
        for b in account.balances:
            if b.currency == currency:
                return b
        bal = AccountBalance(account_id=account.id, currency=currency, balance=0.0)
        db.add(bal)
        db.flush()
        account.balances.append(bal)
        return bal

    def ensure_category(name: str, cat_type: str, parent: Optional[Category] = None) -> Category:
        key = name.lower()
        if key in categories_cache:
            existing = categories_cache[key]
            # Обновляем parent_id если ранее был корневой, а теперь у него есть родитель
            if parent and existing.parent_id is None:
                existing.parent_id = parent.id
                db.flush()
            return existing
        cat = Category(
            user_id=user_id,
            name=name,
            type=cat_type,
            color="#6366f1",
            icon=None,
            parent_id=parent.id if parent else None,
        )
        db.add(cat)
        db.flush()
        categories_cache[key] = cat
        return cat

    imported = 0
    skipped = 0
    errors: list[dict] = []

    for r in rows:
        if r.error:
            skipped += 1
            continue
        try:
            ensure_user_currency(r.currency)
            account = ensure_account(r.account)
            bal = ensure_balance(account, r.currency)

            # Категория
            cat: Optional[Category] = None
            if not r.transfer_to:
                cat_type = "expense" if r.amount < 0 else "income"
                parent_cat = None
                if r.category_parent:
                    parent_cat = ensure_category(r.category_parent, cat_type)
                if r.category_child:
                    cat = ensure_category(r.category_child, cat_type, parent=parent_cat)
                elif parent_cat:
                    cat = parent_cat

            # Тип транзакции
            if r.transfer_to:
                tx_type = TransactionType.transfer
            else:
                tx_type = TransactionType.expense if r.amount < 0 else TransactionType.income

            description = r.description
            if r.transfer_to:
                arrow = "→" if r.amount < 0 else "←"
                prefix = f"Перевод {arrow} {r.transfer_to}"
                description = f"{prefix}: {description}" if description else prefix

            tx_date = datetime.strptime(r.date, "%Y-%m-%d") if r.date else None

            tx = Transaction(
                amount=r.abs_amount,
                currency=r.currency.upper(),
                type=tx_type,
                description=description,
                date=tx_date,
                account_id=account.id,
                category_id=cat.id if cat else None,
                user_id=user_id,
            )
            db.add(tx)

            # Обновляем баланс
            if r.amount < 0:
                bal.balance -= r.abs_amount
            else:
                bal.balance += r.abs_amount

            imported += 1
        except Exception as e:
            skipped += 1
            errors.append({"line_no": r.line_no, "error": str(e)})

    db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors}
