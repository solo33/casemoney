"""Family: recurring. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.family_recurring_suggestion import FamilyRecurringSuggestionDecision
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import TransactionType
from app.models.user import User
from app.services.notifications import notify_user
from app.services.family_recurring import find_family_recurring_suggestions
from app.services.family_context import require_membership


def family_recurring_suggestions(db: Session=None, user_id: int=None):
    """Suggest, but never automatically create, recurring common payments."""
    membership = require_membership(db, user_id)
    return {
        "items": find_family_recurring_suggestions(db, membership.family_id, user_id),
    }


def _family_recurring_suggestion_or_404(
    db: Session, family_id: int, user_id: int, fingerprint: str,
) -> dict:
    for item in find_family_recurring_suggestions(
        db, family_id, user_id, include_resolved=True,
    ):
        if item["fingerprint"] == fingerprint:
            return item
    raise HTTPException(status_code=404, detail="Предложение регулярного платежа не найдено")


def dismiss_family_recurring_suggestion(fingerprint: str, db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    _family_recurring_suggestion_or_404(db, membership.family_id, user_id, fingerprint)
    existing = db.query(FamilyRecurringSuggestionDecision).filter(
        FamilyRecurringSuggestionDecision.family_id == membership.family_id,
        FamilyRecurringSuggestionDecision.fingerprint == fingerprint,
    ).first()
    if existing:
        return {"status": existing.status}
    db.add(FamilyRecurringSuggestionDecision(
        family_id=membership.family_id,
        fingerprint=fingerprint,
        status="dismissed",
        decided_by_user_id=user_id,
    ))
    db.commit()
    return {"status": "dismissed"}


def create_family_recurring_suggestion(fingerprint: str, db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    suggestion = _family_recurring_suggestion_or_404(db, membership.family_id, user_id, fingerprint)
    if not suggestion["can_create"]:
        raise HTTPException(
            status_code=403,
            detail="Регулярную операцию может создать участник, с чьего счёта проходили эти расходы",
        )
    existing = db.query(FamilyRecurringSuggestionDecision).filter(
        FamilyRecurringSuggestionDecision.family_id == membership.family_id,
        FamilyRecurringSuggestionDecision.fingerprint == fingerprint,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Это предложение уже обработано")

    schedule = RecurringTransaction(
        user_id=user_id,
        name=suggestion["description"][:120],
        type=TransactionType.expense,
        amount=suggestion["amount"],
        currency=suggestion["currency"],
        account_id=suggestion["account_id"],
        category_id=suggestion["category_id"],
        description=suggestion["description"],
        frequency=suggestion["frequency"],
        next_date=suggestion["next_date"],
        family_id=membership.family_id,
        is_family_expense=True,
        reimbursement_amount=suggestion["reimbursement_amount"],
        suggestion_fingerprint=fingerprint,
    )
    db.add(schedule)
    db.add(FamilyRecurringSuggestionDecision(
        family_id=membership.family_id,
        fingerprint=fingerprint,
        status="created",
        decided_by_user_id=user_id,
    ))
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        notify_user(
            db, user, event="planned_operation",
            title="Создан регулярный общий платёж",
            message=f"«{suggestion['description']}» будет добавляться в план {suggestion['frequency_label']}.",
            link="/planning",
        )
    db.commit()
    db.refresh(schedule)
    return {"id": schedule.id, "status": "created"}
