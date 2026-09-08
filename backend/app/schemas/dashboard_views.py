from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class AccountSummary(BaseModel):
    id: int
    name: str
    total_in_main: float  # сумма всех балансов счёта в main_currency
    type: str
    color: Optional[str]
    icon: Optional[str]


class CategoryStat(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: Optional[str]
    total: float


class MonthStat(BaseModel):
    month: str   # "2025-01"
    income: float   # в main_currency
    expense: float


class RecentTransaction(BaseModel):
    id: int
    amount: float
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
    to_amount: Optional[float] = None
    to_currency: Optional[str] = None
    is_family_expense: bool = False
    reimbursement_amount: float = 0
    updated_at: Optional[datetime] = None


class ForecastItem(BaseModel):
    id: str
    date: datetime
    type: str
    amount: float
    currency: str
    impact_in_main: float
    description: Optional[str]
    account_name: str
    category_name: Optional[str]


class ForecastSummary(BaseModel):
    days: int
    until_date: datetime
    income: float
    expense: float
    net: float
    projected_balance: float
    events: List[ForecastItem]


class DashboardResponse(BaseModel):
    main_currency: str
    total_balance: float        # суммарно по всем счетам в main_currency
    month_income: float         # в main_currency
    month_expense: float        # в main_currency
    accounts: List[AccountSummary]
    top_categories: List[CategoryStat]
    monthly_stats: List[MonthStat]
    recent_transactions: List[RecentTransaction]
    recently_changed: List[RecentTransaction]  # последние изменённые (по updated_at)
    forecast: ForecastSummary
