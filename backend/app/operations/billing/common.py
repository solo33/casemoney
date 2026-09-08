"""Billing: common. Callers supply resolved user and database session."""
import os
from decimal import Decimal
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.family import FamilyMember



def _test_price(period: str) -> Decimal:
    variable = "FAMILY_TEST_YEAR_PRICE_RUB" if period == "year" else "FAMILY_TEST_MONTH_PRICE_RUB"
    default = "2990" if period == "year" else "299"
    try:
        return max(Decimal("0"), Decimal(os.getenv(variable, default))).quantize(Decimal("0.01"))
    except Exception as exc:
        raise ApplicationError(status_code=500, detail="Некорректно задана тестовая стоимость Family") from exc


def _ensure_user_can_purchase_family(db: Session, user: User) -> None:
    """Family оплачивает только владелец общего пространства."""
    membership = db.query(FamilyMember).filter(
        FamilyMember.user_id == user.id,
        FamilyMember.status == "active",
    ).first()
    if membership and membership.role != "owner":
        raise ApplicationError(status_code=403, detail="Оплату Family оформляет владелец семейного пространства")
