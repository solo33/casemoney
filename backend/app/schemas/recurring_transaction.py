from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class RecurringTransactionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = Field(pattern="^(income|expense)$")
    amount: float = Field(gt=0)
    currency: str = Field(min_length=2, max_length=10)
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)
    frequency: str = Field("monthly", pattern="^(daily|weekly|biweekly|monthly|yearly)$")
    next_date: date


class RecurringTransactionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None, min_length=2, max_length=10)
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)
    frequency: Optional[str] = Field(None, pattern="^(daily|weekly|biweekly|monthly|yearly)$")
    next_date: Optional[date] = None
    is_active: Optional[bool] = None


class RecurringTransactionResponse(RecurringTransactionCreate):
    id: int
    last_generated_for: Optional[date] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
