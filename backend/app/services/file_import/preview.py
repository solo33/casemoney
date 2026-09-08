"""import_csv: preview."""
from __future__ import annotations

from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.category import Category
from app.models.user_currency import UserCurrency
from app.services.file_import.types import ImportPreview, ParsedRow


def build_preview(db: Session, user_id: int, rows: list[ParsedRow]) -> ImportPreview:
    """Собирает сводку: что нового нужно создать, итоги."""
    existing_accounts = {
        a.name: a for a in db.query(Account).filter(Account.user_id == user_id).all()
    }
    all_existing_cats = db.query(Category).filter(Category.user_id == user_id).all()
    cats_by_id_pre = {c.id: c for c in all_existing_cats}
    existing_categories: dict[tuple, Category] = {}
    for c in all_existing_cats:
        parent_name = None
        if c.parent_id and c.parent_id in cats_by_id_pre:
            parent_name = cats_by_id_pre[c.parent_id].name.lower()
        existing_categories[(parent_name, c.name.lower())] = c
    existing_user_currencies = {
        uc.currency.upper() for uc in db.query(UserCurrency).filter(UserCurrency.user_id == user_id).all()
    }

    new_accounts: set[str] = set()
    seen_accounts: set[str] = set()
    new_categories: dict[tuple, str] = {}   # (parent_name, name) → type
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
        if r.to_currency:
            currencies.add(r.to_currency)
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
            # Корневая
            if r.category_parent:
                key = (None, r.category_parent.lower())
                if key in existing_categories:
                    seen_categories.add(r.category_parent)
                else:
                    new_categories.setdefault(key, cat_type)
            # Дочерняя
            if r.category_child:
                key = (r.category_parent.lower() if r.category_parent else None,
                       r.category_child.lower())
                if key in existing_categories:
                    seen_categories.add(r.category_child)
                else:
                    new_categories.setdefault(key, cat_type)

    p = ImportPreview()
    p.rows = rows
    p.new_accounts = sorted(new_accounts)
    p.existing_accounts = sorted(seen_accounts)
    p.new_categories = [
        {"name": (k[1] if not k[0] else f"{k[0]}\\{k[1]}"), "type": t}
        for k, t in sorted(new_categories.items(), key=lambda item: ((item[0][0] or ""), item[0][1]))
    ]
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
