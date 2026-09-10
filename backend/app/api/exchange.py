from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.financial_dependencies import financial_db
from app.operations.exchange import queries, commands
from app.schemas.exchange_views import ConvertResponse, RatesResponse


router = APIRouter(prefix="/api/exchange-rates", tags=["exchange-rates"])

@router.get("/", response_model=RatesResponse)
def list_rates(db: Session = Depends(financial_db, scope="function")):
    'Все закэшированные курсы.'
    return operation_response(queries.list_rates(db=db))


@router.post("/refresh", response_model=dict)
def refresh_rates(db: Session = Depends(financial_db, scope="function")):
    'Принудительно обновить все ходовые курсы (CBR + CoinGecko).'
    return operation_response(commands.refresh_rates(db=db))


@router.get("/convert", response_model=ConvertResponse)
def convert_amount(
    amount: float = Query(..., ge=0),
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    db: Session = Depends(financial_db, scope="function"),
):
    'Конверсия суммы между двумя валютами по текущему курсу (с кэшем).'
    return operation_response(queries.convert_amount(amount=amount, from_currency=from_currency, to_currency=to_currency, db=db))
