from typing import Literal
from pydantic import BaseModel


class InsightRequest(BaseModel):
    period_days: Literal[30, 90, 365] = 30


class InsightItem(BaseModel):
    kind: Literal["positive", "warning", "neutral"]
    title: str
    message: str


class InsightResponse(BaseModel):
    currency: str
    period_days: int
    income: float
    expense: float
    net: float
    insights: list[InsightItem]
