from app.money import MoneyValue
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime


class GoalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    icon: Optional[str] = None
    target_amount: MoneyValue = Field(..., gt=0)
    currency: str = Field("RUB", min_length=2, max_length=10)
    current_amount: MoneyValue = 0.0
    account_id: Optional[int] = None    # если задан — прогресс live из баланса счёта
    due_date: Optional[date] = None
    sort_order: int = 0
    is_shared: bool = False


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    target_amount: Optional[MoneyValue] = None
    currency: Optional[str] = None
    current_amount: Optional[MoneyValue] = None
    account_id: Optional[int] = None
    due_date: Optional[date] = None
    sort_order: Optional[int] = None


class GoalResponse(BaseModel):
    id: int
    name: str
    icon: Optional[str]
    target_amount: MoneyValue
    currency: str
    current_amount: MoneyValue          # эффективное значение (live если account_id)
    progress_percent: MoneyValue        # 0..100 (clamped)
    account_id: Optional[int]
    account_name: Optional[str]
    due_date: Optional[date]
    sort_order: int
    remaining_amount: MoneyValue
    monthly_contribution: Optional[MoneyValue]
    weekly_contribution: Optional[MoneyValue]
    forecast_date: Optional[date]
    schedule_deviation_days: Optional[int]
    # Порядок целей используется не только для сортировки: доступный общий
    # остаток распределяется последовательно и показывает, что реально уже
    # можно направить на каждую цель.
    priority_allocation_amount: Optional[MoneyValue]
    priority_shortfall_amount: Optional[MoneyValue]
    family_id: Optional[int]
    is_shared: bool
    contributions_total: MoneyValue
    contributions: list[dict]
    is_archived: bool = False
    archived_at: Optional[datetime] = None

    class Config:
        from_attributes = True
