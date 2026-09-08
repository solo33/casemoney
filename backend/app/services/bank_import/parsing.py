"""tbank_import: parsing."""
from __future__ import annotations

import csv
import hashlib
import io
import json
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional
from app.services.bank_import.types import NO_CARD_KEY, REQUIRED_HEADERS, TBankItem, TBankRow


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
