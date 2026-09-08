"""import_csv: types."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


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
    # Для переводов, у которых нашлась зеркальная строка (доход на встречном
    # счёте) — валюта/сумма зачисления, если она отличается от исходной
    # (конвертация валют внутри перевода). None = зачисление в той же валюте.
    to_currency: Optional[str] = None
    to_amount: Optional[float] = None


@dataclass
class ImportPreview:
    rows: list[ParsedRow] = field(default_factory=list)
    new_accounts: list[str] = field(default_factory=list)
    existing_accounts: list[str] = field(default_factory=list)
    new_categories: list[dict] = field(default_factory=list)   # [{path, type}]
    existing_categories: list[str] = field(default_factory=list)
    currencies_to_add: list[str] = field(default_factory=list)  # валюты не в user_currencies
    totals: dict = field(default_factory=dict)


COLUMN_ALIASES = {
    "date": "date",
    "дата": "date",
    "account": "account",
    "счет": "account",
    "счёт": "account",
    "category": "category",
    "категория": "category",
    "amount": "amount",
    "total": "amount",
    "сумма": "amount",
    "expense": "expense",
    "расход": "expense",
    "income": "income",
    "доход": "income",
    "currency": "currency",
    "валюта": "currency",
    "record": "record",
    "запись": "record",
    "description": "description",
    "note": "description",
    "comment": "description",
    "описание": "description",
    "комментарий": "description",
    "transfer": "transfer",
    "перевод": "transfer",
}


REQUIRED_COLUMNS = {"date", "account", "amount"}


SPLIT_AMOUNT_COLUMNS = {"date", "account", "expense", "income"}


POSITIONAL_COLUMNS = ["date", "account", "category", "amount", "currency", "description", "transfer"]
