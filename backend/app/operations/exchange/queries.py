"""Exchange: queries. Callers supply resolved user and database session."""
from app.money import decimal
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.exchange_rate import ExchangeRate
from app.services import exchange as exchange_svc
from app.schemas.exchange_views import ConvertResponse, RateItem, RatesResponse


def list_rates(db: Session=None):
    """Все закэшированные курсы."""
    rows = db.query(ExchangeRate).all()
    return RatesResponse(rates=[RateItem.model_validate(r) for r in rows])


def convert_amount(amount: float=..., from_currency: str=..., to_currency: str=..., db: Session=None):
    """Конверсия суммы между двумя валютами по текущему курсу (с кэшем)."""
    try:
        rate = exchange_svc.get_rate(db, from_currency, to_currency)
    except exchange_svc.ExchangeError as e:
        raise ApplicationError(status_code=502, detail=str(e))
    return ConvertResponse(
        from_currency=from_currency.upper(),
        to_currency=to_currency.upper(),
        amount=amount,
        converted=round(decimal(amount) * rate, 2),
        rate=rate,
    )
