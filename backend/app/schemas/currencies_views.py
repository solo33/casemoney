from app.money import MoneyValue
from pydantic import BaseModel


class CurrencyConversionResponse(BaseModel):
    from_currency: str
    to_currency: str
    amount: MoneyValue
    converted: MoneyValue
    rate: MoneyValue
    source: str
