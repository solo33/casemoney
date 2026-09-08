from pydantic import BaseModel


class CurrencyConversionResponse(BaseModel):
    from_currency: str
    to_currency: str
    amount: float
    converted: float
    rate: float
    source: str
