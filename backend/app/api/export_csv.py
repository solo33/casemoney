"""Экспорт транзакций в CSV (формат iHomeMoney/HomeMoney — совместим с импортом)."""
import csv
import io
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from app.models.account import Account
from app.models.category import Category
from app.services.auth import decode_token

router = APIRouter(prefix="/api/export", tags=["export"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _format_amount(value: float) -> str:
    # русский формат: запятая как десятичный разделитель, 2 знака
    return f"{value:.2f}".replace(".", ",")


_CSV_INJECT_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _safe_text(value: str) -> str:
    """Защита от CSV formula injection (OWASP): экранируем значения,
    начинающиеся с =/+/-/@/таб/CR — Excel и Google Sheets интерпретируют их как формулы."""
    if not value:
        return value or ""
    if value[:1] in _CSV_INJECT_CHARS:
        return "'" + value
    return value


def _category_path(cat: Optional[Category], by_id: dict[int, Category]) -> str:
    """Возвращает 'Parent\\Child' или просто имя если корневая."""
    if not cat:
        return ""
    if cat.parent_id and cat.parent_id in by_id:
        parent = by_id[cat.parent_id]
        return f"{parent.name}\\{cat.name}"
    return cat.name


@router.get("/csv")
def export_csv(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Скачать CSV всех транзакций пользователя.

    Формат совместим с /api/import/preview: date;account;category;total;currency;description;transfer
    """
    accounts = {a.id: a for a in db.query(Account).filter(Account.user_id == user_id).all()}
    categories = {c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()}

    q = db.query(Transaction).filter(Transaction.user_id == user_id)
    if date_from:
        q = q.filter(Transaction.date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Transaction.date <= datetime.combine(date_to, datetime.max.time()))
    transactions = q.order_by(Transaction.date.asc(), Transaction.id.asc()).all()

    # Готовим CSV в памяти
    buf = io.StringIO()
    # BOM для нормального открытия в Excel
    buf.write("﻿")
    writer = csv.writer(buf, delimiter=";", lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(["date", "account", "category", "total", "currency", "description", "transfer"])

    for t in transactions:
        acc = accounts.get(t.account_id)
        cat = categories.get(t.category_id) if t.category_id else None
        # Сумма: положительная для доход, отрицательная для расход.
        # transfer: на текущий момент в БД мы храним направление через знак самого amount
        # (см. import — мы сохраняем абсолютное значение, но для exp/inc используем знак).
        # Для transfer мы тоже храним abs(amount), направление определяется по типу записи и описанию.
        # Здесь воспроизводим: expense -> отрицательный, income -> положительный.
        # Для transfer пытаемся вытащить адресата из описания вида "Перевод → X" / "Перевод ← X".
        transfer_to = ""
        amount = t.amount
        if t.type == TransactionType.expense:
            amount = -amount
        elif t.type == TransactionType.income:
            amount = +amount
        elif t.type == TransactionType.transfer:
            desc = (t.description or "")
            if "→" in desc:
                # стрелка наружу: deposit -> Тинькофф, значит amount отрицательный с этой стороны
                amount = -amount
                # Извлечь имя после "→"
                try:
                    transfer_to = desc.split("→", 1)[1].split(":", 1)[0].strip()
                except Exception:
                    transfer_to = ""
            elif "←" in desc:
                amount = +amount
                try:
                    transfer_to = desc.split("←", 1)[1].split(":", 1)[0].strip()
                except Exception:
                    transfer_to = ""

        writer.writerow([
            t.date.strftime("%d.%m.%Y") if t.date else "",
            _safe_text(acc.name if acc else ""),
            _safe_text(_category_path(cat, categories)),
            _format_amount(amount),
            _safe_text(t.currency or ""),
            _safe_text(t.description or ""),
            _safe_text(transfer_to),
        ])

    buf.seek(0)
    filename = f"casemoney_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    def iterate():
        yield buf.read().encode("utf-8")

    return StreamingResponse(
        iterate(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
