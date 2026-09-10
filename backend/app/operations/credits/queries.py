"""Credits: queries. Callers supply resolved user and database session."""
from app.money import decimal
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.credit import CreditObligation
from app.schemas.credit import MortgagePaymentPreview, CreditSummary, MortgageScheduleResponse
from app.services.credit_reminders import process_credit_reminders
from app.operations.credits.common import _calculate_mortgage_split, _mortgage_schedule, _serialize


def list_credits(db: Session=None, user_id: int=None):
    credits = (
        db.query(CreditObligation)
        .filter(CreditObligation.user_id == user_id)
        .order_by(CreditObligation.status, CreditObligation.next_payment_date, CreditObligation.id)
        .all()
    )
    process_credit_reminders(db, user_id=user_id)
    return [_serialize(db, item) for item in credits]


def credit_summary(db: Session=None, user_id: int=None):
    credits = db.query(CreditObligation).filter(
        CreditObligation.user_id == user_id,
        CreditObligation.status == "active",
    ).order_by(CreditObligation.next_payment_date, CreditObligation.id).all()
    process_credit_reminders(db, user_id=user_id)
    serialized = [_serialize(db, item, with_payments=False) for item in credits]
    return CreditSummary(
        total_active=len(serialized),
        overdue_count=sum(1 for item in serialized if item.is_overdue),
        upcoming=[item for item in serialized if item.next_payment_date][:5],
    )


def mortgage_schedule(credit_id: int, db: Session=None, user_id: int=None):
    credit = db.query(CreditObligation).filter(
        CreditObligation.id == credit_id,
        CreditObligation.user_id == user_id,
    ).first()
    if not credit:
        raise ApplicationError(status_code=404, detail="Ипотека не найдена")
    return MortgageScheduleResponse(
        credit_id=credit.id,
        currency=credit.currency,
        monthly_payment=decimal(credit.monthly_payment or 0),
        early_repayment_mode=credit.early_repayment_mode,
        items=_mortgage_schedule(credit),
    )


def mortgage_payment_preview(credit_id: int, amount: float, db: Session=None, user_id: int=None):
    """Server-side source of truth for the mortgage payment split."""
    if amount <= 0:
        raise ApplicationError(status_code=400, detail="Сумма должна быть больше нуля")
    credit = db.query(CreditObligation).filter(
        CreditObligation.id == credit_id,
        CreditObligation.user_id == user_id,
        CreditObligation.kind == "mortgage",
    ).first()
    if not credit:
        raise ApplicationError(status_code=404, detail="Ипотека не найдена")
    principal, interest = _calculate_mortgage_split(credit, amount)
    if principal is None or interest is None:
        raise ApplicationError(status_code=400, detail="Укажите годовую ставку в настройках ипотеки")
    return MortgagePaymentPreview(
        principal_amount=principal,
        interest_amount=interest,
        currency=credit.currency,
    )
