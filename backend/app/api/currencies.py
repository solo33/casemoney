from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.financial_dependencies import financial_db
from app.schemas.user_currency import UserCurrencyCreate, UserCurrencyUpdate, UserCurrencyResponse, CurrenciesResponse
from app.operations.currencies import queries, commands
from app.schemas.currencies_views import CurrencyConversionResponse


router = APIRouter(prefix="/api/currencies", tags=["currencies"])

@router.get("/", response_model=CurrenciesResponse)
def list_currencies(
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(queries.list_currencies(db=db, user_id=user_id))


@router.get("/convert", response_model=CurrencyConversionResponse)
def convert_currency(
    amount: float = Query(..., ge=0),
    from_currency: str = Query(..., alias="from", min_length=2, max_length=10),
    to_currency: str = Query(..., alias="to", min_length=2, max_length=10),
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    'Preview a transfer using the same user-specific rate as transaction creation.'
    return operation_response(queries.convert_currency(amount=amount, from_currency=from_currency, to_currency=to_currency, db=db, user_id=user_id))


@router.post("/", response_model=UserCurrencyResponse, status_code=201)
def add_currency(
    data: UserCurrencyCreate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.add_currency(data=data, db=db, user_id=user_id))


@router.patch("/{currency_id}", response_model=UserCurrencyResponse)
def update_currency(
    currency_id: int,
    data: UserCurrencyUpdate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.update_currency(currency_id=currency_id, data=data, db=db, user_id=user_id))


@router.delete("/{currency_id}", status_code=204)
def delete_currency(
    currency_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.delete_currency(currency_id=currency_id, db=db, user_id=user_id))
