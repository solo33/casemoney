"""Family: settlements. Callers supply resolved user and database session."""
from datetime import datetime, timezone
from app.application import ApplicationError
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.family import FamilyExpenseAccounting, FamilyMember, FamilySettlement
from app.models.transaction import Transaction
from app.models.user import User
from app.services.notifications import notify_family_members
from app.services.family_context import accounting_rows_query, require_membership
from app.schemas.family_views import SettlementCreate


def create_settlement(data: SettlementCreate, db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    if membership.role == "viewer":
        raise ApplicationError(status_code=403, detail="Наблюдатель не может создавать возмещения")
    # Счёт владельца уже уменьшился при переносе покупок в его учёт. Поэтому
    # возврат закрывает только внутренний долг и не создаёт второе списание.
    if membership.role != "owner":
        raise ApplicationError(status_code=403, detail="Возмещение фиксирует владелец семейного пространства")
    recipient = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        FamilyMember.user_id == data.to_user_id,
        FamilyMember.status == "active",
    ).first()
    if not recipient:
        raise ApplicationError(status_code=404, detail="Участник семьи не найден")
    if data.to_user_id == user_id:
        raise ApplicationError(status_code=400, detail="Нельзя возместить самому себе")
    currency = data.currency.upper()
    accepted_rows = accounting_rows_query(db, membership.family_id).filter(
        FamilyExpenseAccounting.status == "accepted",
        FamilyExpenseAccounting.source_user_id == data.to_user_id,
    ).all()
    accepted_ids = [item.source_transaction_id for item in accepted_rows]
    owed = 0.0
    if accepted_ids:
        owed = float(
            db.query(func.coalesce(func.sum(Transaction.reimbursement_amount), 0))
            .filter(
                Transaction.id.in_(accepted_ids),
                Transaction.currency == currency,
            )
            .scalar()
            or 0
        )
    reimbursed = db.query(func.coalesce(func.sum(FamilySettlement.amount), 0)).filter(
        FamilySettlement.family_id == membership.family_id,
        FamilySettlement.to_user_id == data.to_user_id,
        FamilySettlement.currency == currency,
    ).scalar() or 0
    if data.amount > float(owed) - float(reimbursed) + 0.005:
        raise ApplicationError(status_code=400, detail="Сумма больше подтверждённого долга к возмещению")
    settlement = FamilySettlement(
        family_id=membership.family_id,
        from_user_id=user_id,
        to_user_id=data.to_user_id,
        amount=data.amount,
        currency=currency,
        date=data.date or datetime.now(timezone.utc),
        description=data.description,
        created_by_user_id=user_id,
        from_account_id=data.from_account_id,
        to_account_id=data.to_account_id,
    )
    db.add(settlement)
    sender = db.query(User).filter(User.id == user_id).first()
    sender_name = sender.username if sender and sender.username else "Участник семьи"
    notify_family_members(
        db,
        family_id=membership.family_id,
        actor_user_id=user_id,
        recipient_ids={data.to_user_id},
        event="family_reimbursement",
        title="Отмечено семейное возмещение",
        message=(
            f"{sender_name} отметил(а) возмещение "
            f"{data.amount:.2f} {data.currency.upper()}."
        ),
        link="/settings/family",
    )
    db.commit()
    db.refresh(settlement)
    return {"id": settlement.id}
