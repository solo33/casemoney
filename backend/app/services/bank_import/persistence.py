"""tbank_import: persistence."""
from __future__ import annotations

from typing import Optional
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.bank_import_mapping import BankAccountMapping, BankCategoryMapping
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.user_currency import UserCurrency
from app.services.bank_import.types import BANK, TBankItem
from app.services.bank_import.parsing import category_mapping_key


def _upsert_account_mapping(
    db: Session,
    user_id: int,
    source_key: str,
    account_id: int,
) -> None:
    mapping = db.query(BankAccountMapping).filter(
        BankAccountMapping.user_id == user_id,
        BankAccountMapping.bank == BANK,
        BankAccountMapping.source_key == source_key,
    ).first()
    if mapping:
        mapping.account_id = account_id
    else:
        db.add(
            BankAccountMapping(
                user_id=user_id,
                bank=BANK,
                source_key=source_key,
                account_id=account_id,
            )
        )


def _upsert_category_mapping(
    db: Session,
    user_id: int,
    transaction_type: str,
    source_key: str,
    category_id: int,
) -> None:
    mapping = db.query(BankCategoryMapping).filter(
        BankCategoryMapping.user_id == user_id,
        BankCategoryMapping.bank == BANK,
        BankCategoryMapping.transaction_type == transaction_type,
        BankCategoryMapping.source_key == source_key,
    ).first()
    if mapping:
        mapping.category_id = category_id
    else:
        db.add(
            BankCategoryMapping(
                user_id=user_id,
                bank=BANK,
                transaction_type=transaction_type,
                source_key=source_key,
                category_id=category_id,
            )
        )


def execute_tbank_import(
    db: Session,
    user_id: int,
    items: list[TBankItem],
    account_mappings: dict[str, Optional[int]],
    category_mappings: dict[str, Optional[int]],
    *, commit: bool = True,
) -> dict:
    account_ids = {value for value in account_mappings.values() if value is not None}
    accounts = {
        account.id: account
        for account in db.query(Account).filter(
            Account.user_id == user_id,
            Account.id.in_(account_ids),
        )
    }
    if set(account_ids) != set(accounts):
        raise ValueError("Один из выбранных счетов не найден")

    category_ids = {
        value for value in category_mappings.values() if value is not None
    }
    categories = {
        category.id: category
        for category in db.query(Category).filter(
            Category.user_id == user_id,
            Category.id.in_(category_ids),
        )
    }
    if set(category_ids) != set(categories):
        raise ValueError("Одна из выбранных категорий не найдена")

    for source_key, account_id in account_mappings.items():
        if account_id is not None:
            _upsert_account_mapping(db, user_id, source_key, account_id)
    for key, category_id in category_mappings.items():
        if category_id is None or "|" not in key:
            continue
        tx_type, source_key = key.split("|", 1)
        category = categories[category_id]
        if category.type != tx_type:
            raise ValueError(
                f"Категория «{category.name}» имеет неподходящий тип"
            )
        _upsert_category_mapping(
            db,
            user_id,
            tx_type,
            source_key,
            category_id,
        )

    existing_request_ids = {
        value
        for (value,) in db.query(Transaction.client_request_id).filter(
            Transaction.user_id == user_id,
            Transaction.client_request_id.in_(
                [item.request_id for item in items]
            ),
        )
        if value
    }
    user_currencies = {
        value
        for (value,) in db.query(UserCurrency.currency).filter(
            UserCurrency.user_id == user_id
        )
    }
    balances: dict[tuple[int, str], AccountBalance] = {
        (balance.account_id, balance.currency.upper()): balance
        for balance in db.query(AccountBalance).join(Account).filter(
            Account.user_id == user_id
        )
    }

    def ensure_currency(currency: str) -> None:
        currency = currency.upper()
        if currency not in user_currencies:
            db.add(UserCurrency(user_id=user_id, currency=currency, auto=True))
            user_currencies.add(currency)

    def ensure_balance(account_id: int, currency: str) -> AccountBalance:
        key = (account_id, currency.upper())
        if key not in balances:
            balance = AccountBalance(
                account_id=account_id,
                currency=currency.upper(),
                balance=0.0,
            )
            db.add(balance)
            db.flush()
            balances[key] = balance
        return balances[key]

    imported = 0
    duplicates = 0
    unmapped = 0
    skipped = 0
    errors: list[dict] = []

    for item in items:
        if item.error:
            skipped += 1
            errors.append({"line_no": item.line_no, "error": item.error})
            continue
        if item.request_id in existing_request_ids:
            duplicates += 1
            continue

        source_account_id = account_mappings.get(item.source_key)
        if source_account_id is None:
            unmapped += 1
            continue

        target_account_id = None
        if item.tx_type == "transfer":
            target_account_id = account_mappings.get(item.target_source_key or "")
            if target_account_id is None:
                unmapped += 1
                continue
            if target_account_id == source_account_id:
                skipped += 1
                continue

        category_id = None
        if item.tx_type != "transfer":
            category_id = category_mappings.get(category_mapping_key(item))
            if category_id is not None:
                category = categories[category_id]
                if category.type != item.tx_type:
                    errors.append(
                        {
                            "line_no": item.line_no,
                            "error": f"неверный тип категории «{category.name}»",
                        }
                    )
                    skipped += 1
                    continue

        ensure_currency(item.currency)
        source_balance = ensure_balance(source_account_id, item.currency)
        transaction_type = TransactionType(item.tx_type)
        to_amount = float(item.to_amount) if item.to_amount is not None else None
        to_currency = item.to_currency.upper() if item.to_currency else None
        if to_currency:
            ensure_currency(to_currency)

        transaction = Transaction(
            amount=float(item.amount),
            currency=item.currency.upper(),
            type=transaction_type,
            description=item.description or None,
            date=item.operation_at,
            account_id=source_account_id,
            category_id=category_id,
            user_id=user_id,
            to_account_id=target_account_id,
            to_amount=to_amount,
            to_currency=to_currency,
            client_request_id=item.request_id,
            client_request_hash=item.fingerprint,
        )
        db.add(transaction)

        if item.tx_type == "expense":
            source_balance.balance -= float(item.amount)
        elif item.tx_type == "income":
            source_balance.balance += float(item.amount)
        else:
            source_balance.balance -= float(item.amount)
            target_balance = ensure_balance(
                target_account_id,
                to_currency or item.currency,
            )
            target_balance.balance += to_amount if to_amount is not None else float(item.amount)

        existing_request_ids.add(item.request_id)
        imported += 1

    db.commit() if commit else db.flush()
    return {
        "imported": imported,
        "duplicates": duplicates,
        "unmapped": unmapped,
        "skipped": skipped,
        "errors": errors,
    }
