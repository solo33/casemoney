"""Currencies: commands. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.user_currency import UserCurrency
from app.schemas.user_currency import UserCurrencyCreate, UserCurrencyUpdate
from app.services import exchange as exchange_svc
from app.services import limits as limits_svc
from app.operations.currencies.common import _get_main, _serialize


def add_currency(data: UserCurrencyCreate, db: Session=None, user_id: int=None):
    main = _get_main(db, user_id)
    currency = data.currency.upper()

    exists = db.query(UserCurrency).filter(
        UserCurrency.user_id == user_id,
        UserCurrency.currency == currency,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"Валюта {currency} уже добавлена")
    # Ограничения тарифов сейчас не блокируют добавление пользовательских валют.
    limits_svc.enforce_limit(db, user_id, "user_currencies")

    uc = UserCurrency(
        user_id=user_id,
        currency=currency,
        display_name=data.display_name,
        short_code=data.short_code or currency,
        manual_rate=data.manual_rate,
        auto=data.auto,
    )
    db.add(uc)
    db.commit()
    db.refresh(uc)
    return _serialize(uc, db, user_id, main)


def update_currency(currency_id: int, data: UserCurrencyUpdate, db: Session=None, user_id: int=None):
    uc = db.query(UserCurrency).filter(
        UserCurrency.id == currency_id,
        UserCurrency.user_id == user_id,
    ).first()
    if not uc:
        raise HTTPException(status_code=404, detail="Валюта не найдена")

    update = data.model_dump(exclude_unset=True)
    for k, v in update.items():
        setattr(uc, k, v)
    db.commit()
    db.refresh(uc)
    exchange_svc.invalidate_user_rates(user_id)

    main = _get_main(db, user_id)
    return _serialize(uc, db, user_id, main)


def delete_currency(currency_id: int, db: Session=None, user_id: int=None):
    uc = db.query(UserCurrency).filter(
        UserCurrency.id == currency_id,
        UserCurrency.user_id == user_id,
    ).first()
    if not uc:
        raise HTTPException(status_code=404, detail="Валюта не найдена")

    main = _get_main(db, user_id)
    if uc.currency.upper() == main:
        raise HTTPException(status_code=400, detail="Нельзя удалить основную валюту")

    db.delete(uc)
    db.commit()
