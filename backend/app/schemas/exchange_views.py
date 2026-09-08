from datetime import datetime
from typing import List
from pydantic import BaseModel


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


class ConvertResponse(BaseModel):
    from_currency: str
    to_currency: str
    amount: float
    converted: float
    rate: float
