from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.account import Account
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.services.auth import decode_token

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


# --- Схемы ответа ---

class AccountSummary(BaseModel):
    id: int
    name: str
    balance: float
    currency: str
    type: str
    color: Optional[str]
    icon: Optional[str]

    class Config:
        from_attributes = True


class CategoryStat(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: Optional[str]
    total: float


class MonthStat(BaseModel):
    month: str   # "2025-01"
    income: float
    expense: float


class RecentTransaction(BaseModel):
    id: int
    amount: float
    type: str
    description: Optional[str]
    date: datetime
    account_name: str
    category_name: Optional[str]
    category_icon: Optional[str]


class DashboardResponse(BaseModel):
    total_balance: float
    month_income: float
    month_expense: float
    accounts: List[AccountSummary]
    top_categories: List[CategoryStat]
    monthly_stats: List[MonthStat]
    recent_transactions: List[RecentTransaction]


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year

    # 1. Счета и общий баланс
    accounts = db.query(Account).filter(Account.user_id == user_id).all()
    total_balance = sum(a.balance for a in accounts)

    # 2. Доходы и расходы за текущий месяц
    month_transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            extract("month", Transaction.date) == current_month,
            extract("year", Transaction.date) == current_year,
        )
        .all()
    )

    month_income = sum(
        t.amount for t in month_transactions if t.type == TransactionType.income
    )
    month_expense = sum(
        t.amount for t in month_transactions if t.type == TransactionType.expense
    )

    # 3. Топ категорий по расходам (все время)
    expense_rows = (
        db.query(
            Transaction.category_id,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.expense,
        )
        .group_by(Transaction.category_id)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
        .all()
    )

    categories_map = {
        c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }

    top_categories = []
    for row in expense_rows:
        cat = categories_map.get(row.category_id)
        top_categories.append(
            CategoryStat(
                category_id=row.category_id,
                category_name=cat.name if cat else "Без категории",
                category_color=cat.color if cat else "#94a3b8",
                category_icon=cat.icon if cat else None,
                total=round(row.total, 2),
            )
        )

    # 4. Статистика по последним 6 месяцам
    six_months_rows = (
        db.query(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(Transaction.user_id == user_id)
        .group_by("year", "month", Transaction.type)
        .order_by("year", "month")
        .all()
    )

    monthly_map: dict[str, dict] = {}
    for row in six_months_rows:
        key = f"{int(row.year):04d}-{int(row.month):02d}"
        if key not in monthly_map:
            monthly_map[key] = {"income": 0.0, "expense": 0.0}
        if row.type == TransactionType.income:
            monthly_map[key]["income"] += round(row.total, 2)
        elif row.type == TransactionType.expense:
            monthly_map[key]["expense"] += round(row.total, 2)

    monthly_stats = [
        MonthStat(month=k, income=v["income"], expense=v["expense"])
        for k, v in sorted(monthly_map.items())
    ][-6:]  # последние 6 месяцев

    # 5. Последние 10 транзакций
    recent_rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.date.desc())
        .limit(10)
        .all()
    )

    accounts_map = {a.id: a for a in accounts}

    recent_transactions = []
    for t in recent_rows:
        acc = accounts_map.get(t.account_id)
        cat = categories_map.get(t.category_id) if t.category_id else None
        recent_transactions.append(
            RecentTransaction(
                id=t.id,
                amount=t.amount,
                type=t.type.value,
                description=t.description,
                date=t.date,
                account_name=acc.name if acc else "—",
                category_name=cat.name if cat else None,
                category_icon=cat.icon if cat else None,
            )
        )

    return DashboardResponse(
        total_balance=round(total_balance, 2),
        month_income=round(month_income, 2),
        month_expense=round(month_expense, 2),
        accounts=[AccountSummary.model_validate(a) for a in accounts],
        top_categories=top_categories,
        monthly_stats=monthly_stats,
        recent_transactions=recent_transactions,
    )
