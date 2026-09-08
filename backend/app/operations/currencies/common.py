"""Currencies: common. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.user_currency import UserCurrency
from app.schemas.user_currency import UserCurrencyResponse
from app.services import exchange as exchange_svc



def _serialize(uc: UserCurrency, db: Session, user_id: int, main_currency: str) -> UserCurrencyResponse:
    """Считаем эффективный курс этой валюты к main."""
    try:
        rate, source = exchange_svc.get_rate_for_user(
            db, user_id, uc.currency, main_currency,
        )
    except exchange_svc.ExchangeError:
        rate, source = (uc.manual_rate or 0.0, "manual" if uc.manual_rate else "auto")
    return UserCurrencyResponse(
        id=uc.id,
        currency=uc.currency,
        display_name=uc.display_name,
        short_code=uc.short_code or uc.currency,
        manual_rate=uc.manual_rate,
        auto=uc.auto,
        effective_rate=round(rate, 8),
        rate_source=source,
    )


def _get_main(db: Session, user_id: int) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    return (user.main_currency if user and user.main_currency else "RUB").upper()
