from datetime import date
from typing import List, Optional
from pydantic import BaseModel


class CategoryBreakdown(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: Optional[str]
    total: float                         # в main_currency (свой + дочерние при rollup)
    percent: float
    own_total: float = 0.0               # сумма транзакций, привязанных непосредственно к этой категории
    children: List["CategoryBreakdown"] = []  # подкатегории (только при rollup)

    class Config:
        from_attributes = True


class SummaryResponse(BaseModel):
    main_currency: str
    period_label: str
    date_from: date
    date_to: date
    total_income: float    # в main_currency
    total_expense: float   # в main_currency
    net: float             # в main_currency
    transactions_count: int
    category_breakdown: List[CategoryBreakdown]  # rolled-up tree если rollup=true, иначе flat
    top_5: List[CategoryBreakdown]


class BalanceAccountRow(BaseModel):
    account_id: int
    name: str
    icon: Optional[str]
    monthly: List[float]


class BalanceGroupRow(BaseModel):
    group_id: Optional[int]
    group_name: str
    monthly: List[float]   # сумма остатков счетов группы по месяцам
    accounts: List[BalanceAccountRow]


class AnnualBalancesResponse(BaseModel):
    main_currency: str
    year: int
    groups: List[BalanceGroupRow]
    total_monthly: List[float]


class MonthlyTrendPoint(BaseModel):
    month: str        # "2026-05"
    label: str        # "Май"
    income: float     # в main_currency
    expense: float    # в main_currency
    net: float


class MonthlyTrendResponse(BaseModel):
    main_currency: str
    months: int
    points: List[MonthlyTrendPoint]


class AnnualRow(BaseModel):
    category_id: Optional[int]
    category_name: str
    parent_id: Optional[int]      # для отступа в UI
    is_parent: bool               # для жирного выделения
    monthly: List[float]          # 12 значений в main_currency
    total: float


class AnnualReport(BaseModel):
    main_currency: str
    year: int
    income: List[AnnualRow]
    expense: List[AnnualRow]
    income_totals: List[float]    # 12 + сумма не сохраняется отдельно
    income_total: float
    expense_totals: List[float]
    expense_total: float
    net_monthly: List[float]      # income - expense по месяцам
    net_total: float


class YoyRow(BaseModel):
    month: int                 # 1..12
    label: str                 # "Январь"
    values: dict[int, float]


class YoyResponse(BaseModel):
    main_currency: str
    type: str                  # income | expense
    years: List[int]
    rows: List[YoyRow]         # всегда 12 строк-месяцев
    totals: dict[int, float]

CategoryBreakdown.model_rebuild()
