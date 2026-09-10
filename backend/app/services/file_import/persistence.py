"""import_csv: persistence."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.user_currency import UserCurrency
from app.models.user import User
from app.services.automation import matched_category_id
from app.services.file_import.types import ParsedRow


def execute_import(db: Session, user_id: int, rows: list[ParsedRow], *, commit: bool = True) -> dict:
    """Создаёт сущности и транзакции в БД. Возвращает счётчики."""
    main_currency = "RUB"
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.main_currency:
        main_currency = user.main_currency.upper()

    # Кэш существующих
    accounts_cache: dict[str, Account] = {
        a.name: a for a in db.query(Account).filter(Account.user_id == user_id).all()
    }
    # Кэш категорий по ключу (parent_name_lower_or_None, name_lower) — чтобы поддержать
    # одноимённые подкатегории под разными родителями (напр. Развлечения в Отдых и в Личные Фима).
    all_cats = db.query(Category).filter(Category.user_id == user_id).all()
    cats_by_id = {c.id: c for c in all_cats}
    categories_cache: dict[tuple, Category] = {}
    for c in all_cats:
        parent_name = None
        if c.parent_id and c.parent_id in cats_by_id:
            parent_name = cats_by_id[c.parent_id].name.lower()
        categories_cache[(parent_name, c.name.lower())] = c
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
        bal = AccountBalance(account_id=account.id, currency=currency, balance=0)
        db.add(bal)
        db.flush()
        account.balances.append(bal)
        return bal

    def ensure_category(name: str, cat_type: str, parent: Optional[Category] = None) -> Category:
        parent_name = parent.name.lower() if parent else None
        key = (parent_name, name.lower())
        if key in categories_cache:
            return categories_cache[key]
        # Если у корня (parent=None) уже есть категория с таким именем но другим parent — НЕ
        # переиспользуем, создаём новую. Так "Развлечения" в Отдых и в Личные Фима — это разные.
        cat = Category(
            user_id=user_id,
            name=name,
            type=cat_type,
            color="#9f1239",
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
                arrow = "->" if r.amount < 0 else "<-"
                prefix = f"Перевод {arrow} {r.transfer_to}"
                description = f"{prefix}: {description}" if description else prefix

            tx_date = datetime.strptime(r.date, "%Y-%m-%d") if r.date else None

            to_account_id = to_amount = to_currency = None
            if r.transfer_to:
                # Зачисление может быть в другой валюте (обмен при переводе) —
                # если зеркальная строка нашлась, используем её валюту/сумму;
                # иначе (перевод без пары в исходных данных) считаем как раньше —
                # зачисление в той же валюте и на ту же сумму, что списание.
                dest_currency = (r.to_currency or r.currency).upper()
                dest_amount = r.to_amount if r.to_amount is not None else r.abs_amount
                ensure_user_currency(dest_currency)

                other = ensure_account(r.transfer_to)
                ensure_balance(other, dest_currency)
                if r.amount < 0:
                    source = account
                    target = other
                else:
                    source = other
                    target = account
                account = source
                bal = ensure_balance(source, r.currency)
                to_account_id = target.id
                to_amount = dest_amount
                to_currency = dest_currency

            # The file itself may not carry a category column (typical for bank
            # statements) — fall back to the user's own category rules, same as
            # manual entry, instead of always leaving the row uncategorized.
            if cat is None and tx_type != TransactionType.transfer and user and user.automation_rules_enabled:
                rule_category_id = matched_category_id(db, user_id, description, tx_type.value)
                if rule_category_id is not None:
                    cat = cats_by_id.get(rule_category_id)

            tx = Transaction(
                amount=r.abs_amount,
                currency=r.currency.upper(),
                type=tx_type,
                description=description,
                date=tx_date,
                account_id=account.id,
                category_id=cat.id if cat else None,
                user_id=user_id,
                to_account_id=to_account_id,
                to_amount=to_amount,
                to_currency=to_currency,
            )
            db.add(tx)

            if tx_type == TransactionType.transfer:
                bal.balance -= r.abs_amount
                target_bal = ensure_balance(target, to_currency)
                target_bal.balance += to_amount
            elif r.amount < 0:
                bal.balance -= r.abs_amount
            else:
                bal.balance += r.abs_amount

            imported += 1
        except Exception as e:
            skipped += 1
            errors.append({"line_no": r.line_no, "error": str(e)})

    db.commit() if commit else db.flush()
    return {"imported": imported, "skipped": skipped, "errors": errors}
