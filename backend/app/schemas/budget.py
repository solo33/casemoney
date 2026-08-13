from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BudgetCreate(BaseModel):
    category_id: int
    amount: float = Field(gt=0)
    currency: str = Field(min_length=2, max_length=10)


class BudgetUpdate(BaseModel):
    amount: float = Field(gt=0)


class BudgetResponse(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_icon: Optional[str] = None
    period: str
    amount: float
    currency: str
    spent: float
    remaining: float
    percent: float
    is_overspent: bool
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
