"""Tags: queries. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.transaction_tag import Tag
from app.models.transaction import Transaction, TransactionType



def list_tags(db: Session=None, user_id: int=None):
    return db.query(Tag).filter(Tag.user_id == user_id).order_by(Tag.name.asc(), Tag.id.asc()).all()


def tag_report(tag_id: int, db: Session=None, user_id: int=None):
    """Compact all-time project report. Transfers do not form income/expense."""
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Метка не найдена")
    rows = (
        db.query(Transaction.type, Transaction.currency, func.sum(Transaction.amount).label("amount"))
        .join(Transaction.tags)
        .filter(Tag.id == tag.id, Transaction.is_planned.is_(False), Transaction.type != TransactionType.transfer)
        .group_by(Transaction.type, Transaction.currency)
        .order_by(Transaction.currency.asc(), Transaction.type.asc())
        .all()
    )
    return {
        "tag": {"id": tag.id, "name": tag.name, "color": tag.color},
        "totals": [
            {"type": row.type.value, "currency": row.currency, "amount": round(float(row.amount or 0), 2)}
            for row in rows
        ],
    }
