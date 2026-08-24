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
    frequency: str = Field("monthly", pattern="^(daily|weekly|biweekly|monthly|yearly|custom)$")
    custom_interval_days: Optional[int] = Field(None, ge=1, le=365)
    execution_mode: str = Field("planned", pattern="^(planned|automatic)$")
    reminder_days: int = Field(0, ge=0, le=90)
    end_date: Optional[date] = None
    next_date: date


class RecurringTransactionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None, min_length=2, max_length=10)
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)
    frequency: Optional[str] = Field(None, pattern="^(daily|weekly|biweekly|monthly|yearly|custom)$")
    custom_interval_days: Optional[int] = Field(None, ge=1, le=365)
    execution_mode: Optional[str] = Field(None, pattern="^(planned|automatic)$")
    reminder_days: Optional[int] = Field(None, ge=0, le=90)
    end_date: Optional[date] = None
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


class RecurringTransactionRunResponse(BaseModel):
    id: int
    scheduled_for: date
    status: str
    transaction_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
