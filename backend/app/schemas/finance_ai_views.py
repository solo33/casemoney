from typing import Literal
from pydantic import BaseModel


class FinanceAiRequest(BaseModel):
    scenario: Literal["monthly_overview", "spending_anomalies", "budget_tips"]
    period_days: Literal[30, 90] = 30


class FinanceAiResponse(BaseModel):
    scenario: str
    period_days: int
    currency: str
    recommendations: list[str]
    source_note: str
    remaining_requests: int
