"""Export_csv: queries. Callers supply resolved user and database session."""
import csv
import io
from datetime import date, datetime
from typing import Optional
from app.application import StreamData
from sqlalchemy.orm import Session
from app.models.transaction import Transaction, TransactionType
from app.models.account import Account
from app.models.category import Category
from app.operations.export_csv.common import _category_path, _format_amount, _safe_text


def export_csv(date_from: Optional[date]=None, date_to: Optional[date]=None, db: Session=None, user_id: int=None):
    """Скачать CSV всех транзакций пользователя.

    Формат совместим с /api/import/preview: date;account;category;amount;currency;description;transfer
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
    writer.writerow(["date", "account", "category", "amount", "currency", "description", "transfer"])

    for t in transactions:
        acc = accounts.get(t.account_id)
        cat = categories.get(t.category_id) if t.category_id else None
        transfer_to = ""
        amount = t.amount
        if t.type == TransactionType.expense:
            amount = -amount
        elif t.type == TransactionType.income:
            amount = +amount
        elif t.type == TransactionType.transfer:
            amount = -amount
            target = accounts.get(t.to_account_id) if t.to_account_id else None
            transfer_to = target.name if target else ""

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

    return StreamData(
        iterate(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
