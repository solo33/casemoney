"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional, Literal
from app.database import get_db
from app.operations.reports import summary, annual
from app.schemas.reports_views import AnnualBalancesResponse, AnnualReport, MonthlyTrendResponse, SummaryResponse, YoyResponse


router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    period: Literal["month", "quarter", "year", "custom"] = Query("month"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    quarter: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    rollup: bool = Query(True, description="Сворачивать подкатегории под родителя"),
    breakdown_type: Literal["expense", "income"] = Query(
        "expense", description="По какому типу строить разбивку по категориям"
    ),
    include_planned: bool = Query(False),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return summary.get_summary(period=period, year=year, month=month, quarter=quarter, date_from=date_from, date_to=date_to, rollup=rollup, breakdown_type=breakdown_type, include_planned=include_planned, db=db, user_id=user_id)


@router.get("/annual", response_model=AnnualReport)
def get_annual(
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    "Годовой анализ: матрица 'категория x месяц', доходы и расходы.\n\n    Категории идут плоско, но в порядке parent -> children -> next parent.\n    Родительские суммы = own + сумма дочерних (per month).\n    "
    return annual.get_annual(year=year, db=db, user_id=user_id)


@router.get("/annual-balances", response_model=AnnualBalancesResponse)
def get_annual_balances(
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Остаток каждого счёта на конец каждого месяца года, в основной валюте.\n\n    Доход увеличивает остаток, расход уменьшает его. Перевод не меняет\n    общий капитал, но меняет оба конкретных счёта: списывает сумму со\n    счёта-источника и зачисляет сумму в валюте счёта-получателя. Плановые\n    операции в фактический остаток не входят.\n\n    Остаток на конец месяца M = текущий баланс − эффект всех фактических\n    операций после конца M.\n    '
    return annual.get_annual_balances(year=year, db=db, user_id=user_id)


@router.get("/monthly-trend", response_model=MonthlyTrendResponse)
def get_monthly_trend(
    months: int = Query(6, ge=1, le=24),
    include_planned: bool = Query(False),
    end_date: Optional[date] = Query(
        None,
        description="Последний месяц графика; по умолчанию текущий месяц",
    ),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return summary.get_monthly_trend(months=months, include_planned=include_planned, end_date=end_date, db=db, user_id=user_id)


@router.get("/yoy", response_model=YoyResponse)
def get_yoy(
    type: Literal["income", "expense"] = Query("expense"),
    account_ids: Optional[str] = Query(None, description="CSV id счетов"),
    category_ids: Optional[str] = Query(None, description="CSV id категорий (вкл. подкатегории)"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Сравнение год к году: строки — месяцы, колонки — все годы с данными.\n\n    Фильтры по счетам и категориям опциональны; для категорий автоматически\n    включаются подкатегории выбранных.\n    '
    return annual.get_yoy(type=type, account_ids=account_ids, category_ids=category_ids, db=db, user_id=user_id)
