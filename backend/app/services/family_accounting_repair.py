"""Explicit legacy repair. Caller owns flush, commit and rollback."""
from datetime import datetime, timezone
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.models.family import Family, FamilyMember, FamilyExpenseAccounting
from app.models.transaction import Transaction, TransactionType


def repair_family_accounting_rows(db: Session, family_id: int) -> bool:
    """Backfill queue rows for common purchases created before this feature."""
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        return False
    created = False
    existing_ids = {
        item[0]
        for item in db.query(FamilyExpenseAccounting.source_transaction_id).filter(
            FamilyExpenseAccounting.family_id == family_id
        ).all()
    }
    member_user_ids = [item[0] for item in db.query(FamilyMember.user_id).filter(
        FamilyMember.status == "active",
        FamilyMember.user_id.isnot(None),
    ).group_by(FamilyMember.user_id).having(
        func.count(func.distinct(FamilyMember.family_id)) == 1,
        func.min(FamilyMember.family_id) == family_id,
    ).all()]
    rows = db.query(Transaction).filter(
        Transaction.is_family_expense.is_(True),
        Transaction.type == TransactionType.expense,
        Transaction.is_planned.is_(False),
        or_(
            Transaction.family_id == family_id,
            # Before the accounting queue existed some valid shared purchases
            # were only marked by the flag.  Attach those legacy rows to the
            # member's active family once, so they do not vanish from reports.
            Transaction.family_id.is_(None) & Transaction.user_id.in_(member_user_ids),
        ),
    ).all()
    for tx in rows:
        if tx.id in existing_ids:
            continue
        if tx.family_id is None:
            tx.family_id = family_id
        is_owner_purchase = tx.user_id == family.owner_user_id
        db.add(FamilyExpenseAccounting(
            family_id=family_id,
            source_transaction_id=tx.id,
            source_user_id=tx.user_id,
            owner_user_id=family.owner_user_id,
            source_category_id=tx.category_id,
            owner_category_id=tx.category_id if is_owner_purchase else None,
            status="accepted" if is_owner_purchase else "pending",
            accepted_at=datetime.now(timezone.utc) if is_owner_purchase else None,
        ))
        created = True
    return created
