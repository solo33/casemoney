"""Keep family source purchases and accepted owner copies consistent."""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.transaction import Transaction, TransactionType
from app.models.family import FamilyMember, FamilyExpenseAccounting


def sync_family_expense_accounting(db: Session, tx: Transaction) -> None:
    """Keep the owner's accounting queue in sync with a shared purchase."""
    imported = db.query(FamilyExpenseAccounting).filter(
        FamilyExpenseAccounting.owner_transaction_id == tx.id
    ).first()
    if imported:
        imported.owner_category_id = tx.category_id
        imported.owner_account_id = tx.account_id
        return
    existing = db.query(FamilyExpenseAccounting).filter(
        FamilyExpenseAccounting.source_transaction_id == tx.id
    ).first()
    # Planned operations do not represent a purchase yet.  They enter the
    # owner's queue only after the user marks them complete.
    if (
        not tx.is_family_expense
        or tx.type != TransactionType.expense
        or not tx.family_id
        or tx.is_planned
    ):
        if existing:
            db.delete(existing)
        return

    member = db.query(FamilyMember).filter(
        FamilyMember.family_id == tx.family_id,
        FamilyMember.user_id == tx.user_id,
        FamilyMember.status == "active",
    ).first()
    owner_member = db.query(FamilyMember).filter(
        FamilyMember.family_id == tx.family_id,
        FamilyMember.role == "owner",
        FamilyMember.status == "active",
    ).first()
    if not member or not owner_member:
        return
    if not existing:
        existing = FamilyExpenseAccounting(
            family_id=tx.family_id,
            source_transaction_id=tx.id,
            source_user_id=tx.user_id,
            owner_user_id=owner_member.user_id,
            source_category_id=tx.category_id,
            # Покупку владельца можно учитывать сразу — ему не нужно самому
            # подтверждать собственную запись.
            status="accepted" if tx.user_id == owner_member.user_id else "pending",
            accepted_at=datetime.now(timezone.utc) if tx.user_id == owner_member.user_id else None,
            owner_category_id=tx.category_id if tx.user_id == owner_member.user_id else None,
        )
        db.add(existing)
        return
    existing.source_category_id = tx.category_id
    from app.services.linked_transactions import sync_copy
    sync_copy(db, tx, existing)
