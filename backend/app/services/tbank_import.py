"""Import operations from the personal T-Bank CSV export.

T-Bank exports account-to-account transfers as two independent rows. This
module pairs those rows before previewing them, remembers the user's account
and category mappings, and uses transaction idempotency keys to make
overlapping exports safe to import repeatedly.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.bank_import_mapping import (
    BankAccountMapping,
    BankCategoryMapping,
)
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.user_currency import UserCurrency


BANK = "tbank"
NO_CARD_KEY = "__without_card__"
REQUIRED_HEADERS = {
    "Дата операции",
    "Номер карты",
    "Статус",
    "Сумма платежа",
    "Валюта платежа",
    "Категория",
    "Описание",
}


@dataclass
class TBankRow:
    line_no: int
    operation_at: Optional[datetime]
    payment_date: Optional[str]
    source_key: str
    status: str
    amount: Decimal
    currency: str
    category: str
    description: str
    mcc: str
    fingerprint: str
    error: Optional[str] = None


@dataclass
class TBankItem:
    line_no: int
    operation_at: Optional[datetime]
    source_key: str
    amount: Decimal
    currency: str
    category: str
    description: str
    tx_type: str
    fingerprint: str
    target_source_key: Optional[str] = None
    to_amount: Optional[Decimal] = None
    to_currency: Optional[str] = None
    source_lines: tuple[int, ...] = ()
    error: Optional[str] = None
    duplicate: bool = False

    @property
    def request_id(self) -> str:
        return f"tb:{self.fingerprint[:61]}"


def _decode_csv(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Не удалось распознать кодировку файла Т-Банка")


def _money(value: str) -> Decimal:
    normalized = (value or "").strip().replace("\xa0", "").replace(" ", "")
    normalized = normalized.replace(",", ".")
    if not normalized:
        raise InvalidOperation
    return Decimal(normalized)


def _operation_time(value: str) -> Optional[datetime]:
    raw = (value or "").strip()
    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def _canonical_row(raw: dict[str, str]) -> str:
    fields = [
        "Дата операции",
        "Дата платежа",
        "Номер карты",
        "Статус",
        "Сумма операции",
        "Валюта операции",
        "Сумма платежа",
        "Валюта платежа",
        "Кэшбэк",
        "Категория",
        "MCC",
        "Описание",
        "Бонусы (включая кэшбэк)",
        "Округление на инвесткопилку",
        "Сумма операции с округлением",
    ]
    normalized = {
        field: (raw.get(field) or "").strip()
        for field in fields
    }
    return json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def parse_tbank_csv(content: bytes) -> list[TBankRow]:
    text = _decode_csv(content)
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    headers = set(reader.fieldnames or [])
    if not REQUIRED_HEADERS.issubset(headers):
        raise ValueError(
            "Это не похоже на CSV Т-Банка: не найдены обязательные колонки"
        )

    rows: list[TBankRow] = []
    occurrences: Counter[str] = Counter()
    for line_no, raw in enumerate(reader, start=2):
        if not any((value or "").strip() for value in raw.values()):
            continue

        canonical = _canonical_row(raw)
        occurrence = occurrences[canonical]
        occurrences[canonical] += 1
        fingerprint = hashlib.sha256(
            f"{canonical}|{occurrence}".encode("utf-8")
        ).hexdigest()

        error = None
        operation_at = _operation_time(raw.get("Дата операции", ""))
        if operation_at is None:
            error = "не удалось распознать дату операции"

        try:
            amount = _money(raw.get("Сумма платежа", ""))
        except InvalidOperation:
            amount = Decimal("0")
            error = error or "не удалось распознать сумму платежа"

        status = (raw.get("Статус") or "").strip().upper()
        if status != "OK":
            error = error or f"статус операции: {status or 'не указан'}"
        if amount == 0:
            error = error or "нулевая сумма"

        card = (raw.get("Номер карты") or "").strip()
        rows.append(
            TBankRow(
                line_no=line_no,
                operation_at=operation_at,
                payment_date=(raw.get("Дата платежа") or "").strip() or None,
                source_key=card or NO_CARD_KEY,
                status=status,
                amount=amount,
                currency=(raw.get("Валюта платежа") or "RUB").strip().upper(),
                category=(raw.get("Категория") or "").strip() or "Без категории",
                description=(raw.get("Описание") or "").strip(),
                mcc=(raw.get("MCC") or "").strip(),
                fingerprint=fingerprint,
                error=error,
            )
        )
    return rows


def _is_own_transfer(row: TBankRow) -> bool:
    return (
        row.error is None
        and row.category.casefold() == "переводы"
        and row.description.casefold() == "между своими счетами"
    )


def _pair_own_transfers(rows: list[TBankRow]) -> list[TBankItem]:
    candidates = [row for row in rows if _is_own_transfer(row)]
    available_positive = {
        row.line_no: row for row in candidates if row.amount > 0
    }
    paired_lines: set[int] = set()
    items: list[TBankItem] = []

    for outgoing in (row for row in candidates if row.amount < 0):
        matches = [
            incoming
            for incoming in available_positive.values()
            if incoming.line_no not in paired_lines
            and incoming.currency == outgoing.currency
            and abs(incoming.amount) == abs(outgoing.amount)
            and incoming.operation_at is not None
            and outgoing.operation_at is not None
            and abs((incoming.operation_at - outgoing.operation_at).total_seconds()) <= 180
        ]
        if not matches:
            continue
        incoming = min(
            matches,
            key=lambda row: abs((row.operation_at - outgoing.operation_at).total_seconds()),
        )
        paired_lines.update((outgoing.line_no, incoming.line_no))
        pair_fingerprint = hashlib.sha256(
            (
                "transfer|"
                + "|".join(sorted((outgoing.fingerprint, incoming.fingerprint)))
            ).encode("utf-8")
        ).hexdigest()
        items.append(
            TBankItem(
                line_no=min(outgoing.line_no, incoming.line_no),
                operation_at=min(outgoing.operation_at, incoming.operation_at),
                source_key=outgoing.source_key,
                target_source_key=incoming.source_key,
                amount=abs(outgoing.amount),
                currency=outgoing.currency,
                to_amount=abs(incoming.amount),
                to_currency=incoming.currency,
                category="Переводы",
                description="Между своими счетами",
                tx_type="transfer",
                fingerprint=pair_fingerprint,
                source_lines=(outgoing.line_no, incoming.line_no),
            )
        )

    for row in rows:
        if row.line_no in paired_lines:
            continue
        tx_type = "expense" if row.amount < 0 else "income"
        items.append(
            TBankItem(
                line_no=row.line_no,
                operation_at=row.operation_at,
                source_key=row.source_key,
                amount=abs(row.amount),
                currency=row.currency,
                category=row.category,
                description=row.description,
                tx_type=tx_type,
                fingerprint=row.fingerprint,
                source_lines=(row.line_no,),
                error=row.error,
            )
        )

    return sorted(items, key=lambda item: item.line_no)


def prepare_tbank_items(content: bytes) -> list[TBankItem]:
    return _pair_own_transfers(parse_tbank_csv(content))


def category_mapping_key(item: TBankItem) -> str:
    return f"{item.tx_type}|{item.category}"


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
            "amount": float(item.amount),
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

    db.commit()
    return {
        "imported": imported,
        "duplicates": duplicates,
        "unmapped": unmapped,
        "skipped": skipped,
        "errors": errors,
    }
