"""Explicit, bounded repair of legacy exchange snapshots."""
from sqlalchemy import or_
from app.models.transaction import Transaction, TransactionType
from app.services.exchange_snapshots import snapshot_transaction_rates


def repair_snapshot_batch(db, *, after_id=0, limit=500, user_id=None):
    query = db.query(Transaction).filter(
        Transaction.id > after_id,
        or_(
            Transaction.valuation_currency.is_(None),
            Transaction.valuation_currency == "",
            Transaction.exchange_rate.is_(None),
            (Transaction.type == TransactionType.transfer)
            & Transaction.to_currency.is_not(None)
            & Transaction.to_exchange_rate.is_(None),
        ),
    )
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    rows = query.order_by(Transaction.id).limit(limit).with_for_update().all()
    changed = sum(snapshot_transaction_rates(db, row.user_id, row) for row in rows)
    db.commit()
    return {"examined": len(rows), "changed": changed,
            "last_id": rows[-1].id if rows else after_id}
