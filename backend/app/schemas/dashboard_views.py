from app.money import MoneyValue
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class AccountSummary(BaseModel):
    id: int
    name: str
    total_in_main: MoneyValue  # сумма всех балансов счёта в main_currency
    type: str
    color: Optional[str]
    icon: Optional[str]


class CategoryStat(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: Optional[str]
    total: MoneyValue


class MonthStat(BaseModel):
    month: str   # "2025-01"
    income: MoneyValue   # в main_currency
    expense: MoneyValue


class RecentTransaction(BaseModel):
    id: int
    amount: MoneyValue
    currency: str
    type: str
    description: Optional[str]
    date: datetime
    account_id: int
    account_name: str
    category_id: Optional[int] = None
    category_name: Optional[str]
    category_icon: Optional[str]
    to_account_id: Optional[int] = None
    to_amount: Optional[MoneyValue] = None
    to_currency: Optional[str] = None
    is_family_expense: bool = False
    reimbursement_amount: MoneyValue = Field(default=0, json_schema_extra={"default": 0})
    updated_at: Optional[datetime] = None


class ForecastItem(BaseModel):
    id: str
    date: datetime
    type: str
    amount: MoneyValue
    currency: str
    impact_in_main: MoneyValue
    description: Optional[str]
    account_name: str
    category_name: Optional[str]


class ForecastSummary(BaseModel):
    days: int
    until_date: datetime
    income: MoneyValue
    expense: MoneyValue
    net: MoneyValue
    projected_balance: MoneyValue
    events: List[ForecastItem]


class DashboardResponse(BaseModel):
    main_currency: str
    total_balance: MoneyValue        # суммарно по всем счетам в main_currency
    month_income: MoneyValue         # в main_currency
    month_expense: MoneyValue        # в main_currency
    accounts: List[AccountSummary]
    top_categories: List[CategoryStat]
    monthly_stats: List[MonthStat]
    recent_transactions: List[RecentTransaction]
    recently_changed: List[RecentTransaction]  # последние изменённые (по updated_at)
    forecast: ForecastSummary
