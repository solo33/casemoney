from app.money import MoneyValue
from datetime import datetime
from typing import List
from pydantic import BaseModel


class RateItem(BaseModel):
    from_currency: str
    to_currency: str
    rate: MoneyValue
    source: str
    updated_at: datetime

    class Config:
        from_attributes = True


class RatesResponse(BaseModel):
    rates: List[RateItem]


class ConvertResponse(BaseModel):
    from_currency: str
    to_currency: str
    amount: MoneyValue
    converted: MoneyValue
    rate: MoneyValue
