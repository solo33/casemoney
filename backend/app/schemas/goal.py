from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime


class GoalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    icon: Optional[str] = None
    target_amount: float = Field(..., gt=0)
    currency: str = Field("RUB", min_length=2, max_length=10)
    current_amount: float = 0.0
    account_id: Optional[int] = None    # если задан — прогресс live из баланса счёта
    due_date: Optional[date] = None
    sort_order: int = 0
    is_shared: bool = False


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    target_amount: Optional[float] = None
    currency: Optional[str] = None
    current_amount: Optional[float] = None
    account_id: Optional[int] = None
    due_date: Optional[date] = None
    sort_order: Optional[int] = None


class GoalResponse(BaseModel):
    id: int
    name: str
    icon: Optional[str]
    target_amount: float
    currency: str
    current_amount: float          # эффективное значение (live если account_id)
    progress_percent: float        # 0..100 (clamped)
    account_id: Optional[int]
    account_name: Optional[str]
    due_date: Optional[date]
    sort_order: int
    remaining_amount: float
    monthly_contribution: Optional[float]
    weekly_contribution: Optional[float]
    forecast_date: Optional[date]
    schedule_deviation_days: Optional[int]
    # Порядок целей используется не только для сортировки: доступный общий
    # остаток распределяется последовательно и показывает, что реально уже
    # можно направить на каждую цель.
    priority_allocation_amount: Optional[float]
    priority_shortfall_amount: Optional[float]
    family_id: Optional[int]
    is_shared: bool
    contributions_total: float
    contributions: list[dict]
    is_archived: bool = False
    archived_at: Optional[datetime] = None

    class Config:
        from_attributes = True
