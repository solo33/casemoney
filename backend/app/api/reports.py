from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel
from calendar import monthrange

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.services.auth import decode_token

router = APIRouter(prefix="/api/reports", tags=["reports"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


# --- Схемы ответа ---

class CategoryBreakdown(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: Optional[str]
    total: float
    percent: float


class SummaryResponse(BaseModel):
    period_label: str
    date_from: date
    date_to: date
    total_income: float
    total_expense: float
    net: float
    transactions_count: int
    category_breakdown: List[CategoryBreakdown]
    top_5: List[CategoryBreakdown]


# --- Утилита: построить диапазон дат по period-параметру ---

RU_MONTHS = ["", "январь", "февраль", "март", "апрель", "май", "июнь",
             "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]


def resolve_period(
    period: str,
    year: Optional[int],
    month: Optional[int],
    quarter: Optional[int],
    date_from: Optional[date],
    date_to: Optional[date],
) -> tuple[date, date, str]:
    """Возвращает (date_from, date_to, label) для указанного периода."""
    now = datetime.now(timezone.utc)
    y = year or now.year

    if period == "month":
        m = month or now.month
        if not 1 <= m <= 12:
            raise HTTPException(status_code=400, detail="month должен быть 1..12")
        last_day = monthrange(y, m)[1]
        return date(y, m, 1), date(y, m, last_day), f"{RU_MONTHS[m].capitalize()} {y}"

    if period == "quarter":
        q = quarter or ((now.month - 1) // 3 + 1)
        if not 1 <= q <= 4:
            raise HTTPException(status_code=400, detail="quarter должен быть 1..4")
        start_month = (q - 1) * 3 + 1
        end_month = start_month + 2
        last_day = monthrange(y, end_month)[1]
        return date(y, start_month, 1), date(y, end_month, last_day), f"{q} квартал {y}"

    if period == "year":
        return date(y, 1, 1), date(y, 12, 31), f"{y} год"

    if period == "custom":
        if not date_from or not date_to:
            raise HTTPException(status_code=400, detail="date_from и date_to обязательны для custom")
        if date_from > date_to:
            raise HTTPException(status_code=400, detail="date_from > date_to")
        return date_from, date_to, f"{date_from.strftime('%d.%m.%Y')} — {date_to.strftime('%d.%m.%Y')}"

    raise HTTPException(status_code=400, detail=f"Неизвестный period: {period}")


# --- Эндпоинт ---

@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    period: Literal["month", "quarter", "year", "custom"] = Query("month"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    quarter: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    df, dt, label = resolve_period(period, year, month, quarter, date_from, date_to)

    # Все транзакции пользователя за период (один SQL)
    q = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        func.date(Transaction.date) >= df,
        func.date(Transaction.date) <= dt,
    )
    transactions = q.all()

    total_income = sum(t.amount for t in transactions if t.type == TransactionType.income)
    total_expense = sum(t.amount for t in transactions if t.type == TransactionType.expense)

    # Группируем расходы по категориям
    cat_totals: dict[Optional[int], float] = {}
    for t in transactions:
        if t.type != TransactionType.expense:
            continue
        cat_totals[t.category_id] = cat_totals.get(t.category_id, 0.0) + t.amount

    # Загружаем категории за один запрос
    categories_map = {
        c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }

    breakdown: List[CategoryBreakdown] = []
    for cat_id, total in sorted(cat_totals.items(), key=lambda x: x[1], reverse=True):
        cat = categories_map.get(cat_id)
        percent = round((total / total_expense * 100), 1) if total_expense > 0 else 0.0
        breakdown.append(CategoryBreakdown(
            category_id=cat_id,
            category_name=cat.name if cat else "Без категории",
            category_color=cat.color if cat else "#94a3b8",
            category_icon=cat.icon if cat else None,
            total=round(total, 2),
            percent=percent,
        ))

    return SummaryResponse(
        period_label=label,
        date_from=df,
        date_to=dt,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net=round(total_income - total_expense, 2),
        transactions_count=len(transactions),
        category_breakdown=breakdown,
        top_5=breakdown[:5],
    )
