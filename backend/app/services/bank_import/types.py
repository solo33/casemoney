"""tbank_import: types."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional


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
