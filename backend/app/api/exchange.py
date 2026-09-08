"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.operations.exchange import queries, commands
from app.schemas.exchange_views import ConvertResponse, RatesResponse


router = APIRouter(prefix="/api/exchange-rates", tags=["exchange-rates"])

@router.get("/", response_model=RatesResponse)
def list_rates(db: Session = Depends(get_db)):
    'Все закэшированные курсы.'
    return queries.list_rates(db=db)


@router.post("/refresh", response_model=dict)
def refresh_rates(db: Session = Depends(get_db)):
    'Принудительно обновить все ходовые курсы (CBR + CoinGecko).'
    return commands.refresh_rates(db=db)


@router.get("/convert", response_model=ConvertResponse)
def convert_amount(
    amount: float = Query(..., ge=0),
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    'Конверсия суммы между двумя валютами по текущему курсу (с кэшем).'
    return queries.convert_amount(amount=amount, from_currency=from_currency, to_currency=to_currency, db=db)
