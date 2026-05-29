from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.exchange_rate import ExchangeRate
from app.services import exchange as exchange_svc

router = APIRouter(prefix="/api/exchange-rates", tags=["exchange-rates"])


class RateItem(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    source: str
    updated_at: datetime

    class Config:
        from_attributes = True


class RatesResponse(BaseModel):
    rates: List[RateItem]


@router.get("/", response_model=RatesResponse)
def list_rates(db: Session = Depends(get_db)):
    """Все закэшированные курсы."""
    rows = db.query(ExchangeRate).all()
    return RatesResponse(rates=[RateItem.model_validate(r) for r in rows])


@router.post("/refresh", response_model=dict)
def refresh_rates(db: Session = Depends(get_db)):
    """Принудительно обновить все ходовые курсы (CBR + CoinGecko)."""
    try:
        return exchange_svc.refresh_all_rates(db)
    except exchange_svc.ExchangeError as e:
        raise HTTPException(status_code=502, detail=str(e))


class ConvertResponse(BaseModel):
    from_currency: str
    to_currency: str
    amount: float
    converted: float
    rate: float


@router.get("/convert", response_model=ConvertResponse)
def convert_amount(
    amount: float = Query(..., ge=0),
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    """Конверсия суммы между двумя валютами по текущему курсу (с кэшем)."""
    try:
        rate = exchange_svc.get_rate(db, from_currency, to_currency)
    except exchange_svc.ExchangeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return ConvertResponse(
        from_currency=from_currency.upper(),
        to_currency=to_currency.upper(),
        amount=amount,
        converted=round(amount * rate, 2),
        rate=rate,
    )
