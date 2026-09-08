"""Currencies: queries. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.user_currency import UserCurrency
from app.schemas.user_currency import CurrenciesResponse
from app.services import exchange as exchange_svc
from app.operations.currencies.common import _get_main, _serialize
from app.schemas.currencies_views import CurrencyConversionResponse


def list_currencies(db: Session=None, user_id: int=None):
    main = _get_main(db, user_id)
    items = db.query(UserCurrency).filter(UserCurrency.user_id == user_id).all()
    # Гарантируем, что main_currency всегда есть в списке
    if not any(uc.currency.upper() == main for uc in items):
        new_main = UserCurrency(user_id=user_id, currency=main, auto=True)
        db.add(new_main)
        db.commit()
        db.refresh(new_main)
        items.append(new_main)
    # main первой, дальше по алфавиту
    items.sort(key=lambda x: (x.currency != main, x.currency))
    return CurrenciesResponse(
        main_currency=main,
        currencies=[_serialize(uc, db, user_id, main) for uc in items],
    )


def convert_currency(amount: float=..., from_currency: str=..., to_currency: str=..., db: Session=None, user_id: int=None):
    """Preview a transfer using the same user-specific rate as transaction creation."""
    from_code = from_currency.upper()
    to_code = to_currency.upper()
    try:
        rate, source = exchange_svc.get_rate_for_user(
            db, user_id, from_code, to_code,
        )
    except exchange_svc.ExchangeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CurrencyConversionResponse(
        from_currency=from_code,
        to_currency=to_code,
        amount=amount,
        converted=round(amount * rate, 2),
        rate=rate,
        source=source,
    )
