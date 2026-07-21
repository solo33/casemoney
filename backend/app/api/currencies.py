from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.user import User
from app.models.user_currency import UserCurrency
from app.schemas.user_currency import (
    UserCurrencyCreate,
    UserCurrencyUpdate,
    UserCurrencyResponse,
    CurrenciesResponse,
)
from app.services.auth import decode_token
from app.services import exchange as exchange_svc
from app.services import limits as limits_svc

router = APIRouter(prefix="/api/currencies", tags=["currencies"])
security = HTTPBearer()


class CurrencyConversionResponse(BaseModel):
    from_currency: str
    to_currency: str
    amount: float
    converted: float
    rate: float
    source: str


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


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


@router.get("/", response_model=CurrenciesResponse)
def list_currencies(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


@router.get("/convert", response_model=CurrencyConversionResponse)
def convert_currency(
    amount: float = Query(..., ge=0),
    from_currency: str = Query(..., alias="from", min_length=2, max_length=10),
    to_currency: str = Query(..., alias="to", min_length=2, max_length=10),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


@router.post("/", response_model=UserCurrencyResponse, status_code=201)
def add_currency(
    data: UserCurrencyCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


@router.patch("/{currency_id}", response_model=UserCurrencyResponse)
def update_currency(
    currency_id: int,
    data: UserCurrencyUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


@router.delete("/{currency_id}", status_code=204)
def delete_currency(
    currency_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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
