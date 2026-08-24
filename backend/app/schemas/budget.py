from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class BudgetCreate(BaseModel):
    category_id: int
    amount: float = Field(gt=0)
    currency: str = Field(min_length=2, max_length=10)
    period: Literal["month", "quarter", "year"] = "month"
    period_start: Optional[date] = None
    rollover_mode: Literal["none", "carry_remaining", "carry_balance"] = "none"
    include_planned: bool = False
    daily_amount: Optional[float] = Field(None, ge=0)
    scope: Literal["personal", "family", "mixed"] = "personal"


class BudgetUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    rollover_mode: Optional[Literal["none", "carry_remaining", "carry_balance"]] = None
    include_planned: Optional[bool] = None
    daily_amount: Optional[float] = Field(None, ge=0)
    scope: Optional[Literal["personal", "family", "mixed"]] = None


class BudgetResponse(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_icon: Optional[str] = None
    period: str
    period_start: date
    amount: float
    effective_limit: float
    currency: str
    spent: float
    remaining: float
    percent: float
    is_overspent: bool
    rollover_mode: str
    carry_in: float
    include_planned: bool
    daily_amount: Optional[float]
    expected_spent_to_date: Optional[float]
    daily_deviation: Optional[float]
    scope: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetSuggestion(BaseModel):
    category_id: int
    category_name: str
    category_icon: Optional[str] = None
    average_amount: float
    currency: str
    months_with_data: int
