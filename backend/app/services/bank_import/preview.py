"""tbank_import: preview."""
from __future__ import annotations
from app.money import decimal

from collections import Counter
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.bank_import_mapping import BankAccountMapping, BankCategoryMapping
from app.models.category import Category
from app.models.transaction import Transaction
from app.services.bank_import.types import BANK, NO_CARD_KEY, TBankItem
from app.services.bank_import.parsing import category_mapping_key


def _category_path(category: Category, by_id: dict[int, Category]) -> str:
    if category.parent_id and category.parent_id in by_id:
        return f"{by_id[category.parent_id].name} → {category.name}"
    return category.name


def build_tbank_preview(
    db: Session,
    user_id: int,
    items: list[TBankItem],
) -> dict:
    accounts = (
        db.query(Account)
        .filter(Account.user_id == user_id)
        .order_by(Account.sort_order, Account.name)
        .all()
    )
    categories = (
        db.query(Category)
        .filter(Category.user_id == user_id)
        .order_by(Category.type, Category.sort_order, Category.name)
        .all()
    )
    categories_by_id = {category.id: category for category in categories}

    saved_accounts = {
        mapping.source_key: mapping.account_id
        for mapping in db.query(BankAccountMapping).filter(
            BankAccountMapping.user_id == user_id,
            BankAccountMapping.bank == BANK,
        )
    }
    saved_categories = {
        f"{mapping.transaction_type}|{mapping.source_key}": mapping.category_id
        for mapping in db.query(BankCategoryMapping).filter(
            BankCategoryMapping.user_id == user_id,
            BankCategoryMapping.bank == BANK,
        )
    }
    valid_account_ids = {account.id for account in accounts}
    valid_category_ids = {category.id for category in categories}

    request_ids = [item.request_id for item in items]
    existing_ids = {
        value
        for (value,) in db.query(Transaction.client_request_id).filter(
            Transaction.user_id == user_id,
            Transaction.client_request_id.in_(request_ids),
        )
        if value
    }
    for item in items:
        item.duplicate = item.request_id in existing_ids

    account_counts: Counter[str] = Counter()
    for item in items:
        account_counts[item.source_key] += 1
        if item.target_source_key:
            account_counts[item.target_source_key] += 1

    source_accounts = []
    for source_key, count in sorted(
        account_counts.items(),
        key=lambda pair: (pair[0] == NO_CARD_KEY, pair[0]),
    ):
        mapped_id = saved_accounts.get(source_key)
        if mapped_id not in valid_account_ids:
            mapped_id = None
        if mapped_id is None:
            suffix = source_key.lstrip("*")
            matches = [
                account.id
                for account in accounts
                if suffix and suffix in account.name
            ]
            if len(matches) == 1:
                mapped_id = matches[0]
            elif len(accounts) == 1:
                mapped_id = accounts[0].id
        source_accounts.append(
            {
                "source_key": source_key,
                "label": (
                    "Без номера карты"
                    if source_key == NO_CARD_KEY
                    else f"Карта {source_key}"
                ),
                "row_count": count,
                "mapped_account_id": mapped_id,
            }
        )

    category_counts: Counter[str] = Counter()
    category_meta: dict[str, tuple[str, str]] = {}
    for item in items:
        if item.tx_type == "transfer" or item.error:
            continue
        key = category_mapping_key(item)
        category_counts[key] += 1
        category_meta[key] = (item.tx_type, item.category)

    source_categories = []
    for key, count in sorted(
        category_counts.items(),
        key=lambda pair: (
            category_meta[pair[0]][0],
            category_meta[pair[0]][1].casefold(),
        ),
    ):
        tx_type, source_name = category_meta[key]
        mapped_id = saved_categories.get(key)
        if mapped_id not in valid_category_ids:
            mapped_id = None
        if mapped_id is None:
            exact = [
                category.id
                for category in categories
                if category.type == tx_type
                and category.name.casefold() == source_name.casefold()
            ]
            if len(exact) == 1:
                mapped_id = exact[0]
        source_categories.append(
            {
                "mapping_key": key,
                "source_name": source_name,
                "tx_type": tx_type,
                "row_count": count,
                "mapped_category_id": mapped_id,
            }
        )

    preview_rows = [
        {
            "line_no": item.line_no,
            "source_lines": list(item.source_lines),
            "date": item.operation_at.isoformat() if item.operation_at else None,
            "source_key": item.source_key,
            "target_source_key": item.target_source_key,
            "amount": decimal(item.amount),
            "currency": item.currency,
            "category": item.category,
            "description": item.description,
            "tx_type": item.tx_type,
            "duplicate": item.duplicate,
            "error": item.error,
        }
        for item in items
    ]

    return {
        "bank": BANK,
        "source_accounts": source_accounts,
        "source_categories": source_categories,
        "account_options": [
            {
                "id": account.id,
                "name": account.name,
                "currencies": [balance.currency for balance in account.balances],
            }
            for account in accounts
        ],
        "category_options": [
            {
                "id": category.id,
                "name": category.name,
                "path": _category_path(category, categories_by_id),
                "type": category.type,
                "parent_id": category.parent_id,
            }
            for category in categories
        ],
        "rows": preview_rows,
        "totals": {
            "source_rows": sum(len(item.source_lines) for item in items),
            "operations": len(items),
            "ready": sum(not item.error and not item.duplicate for item in items),
            "duplicates": sum(item.duplicate for item in items),
            "errors": sum(bool(item.error) for item in items),
            "transfers": sum(item.tx_type == "transfer" for item in items),
            "income": sum(item.tx_type == "income" for item in items),
            "expenses": sum(item.tx_type == "expense" for item in items),
        },
    }
