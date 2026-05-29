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
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc

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
    total_in_main: float  # сумма всех балансов счёта в main_currency
    type: str
    color: Optional[str]
    icon: Optional[str]


class CategoryStat(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: Optional[str]
    total: float  # в main_currency


class MonthStat(BaseModel):
    month: str   # "2025-01"
    income: float   # в main_currency
    expense: float  # в main_currency


class RecentTransaction(BaseModel):
    id: int
    amount: float
    currency: str
    type: str
    description: Optional[str]
    date: datetime
    account_name: str
    category_name: Optional[str]
    category_icon: Optional[str]


class DashboardResponse(BaseModel):
    main_currency: str
    total_balance: float        # суммарно по всем счетам в main_currency
    month_income: float         # в main_currency
    month_expense: float        # в main_currency
    accounts: List[AccountSummary]
    top_categories: List[CategoryStat]
    monthly_stats: List[MonthStat]
    recent_transactions: List[RecentTransaction]


def _to_main(db: Session, amount: float, currency: str, main: str) -> float:
    """Безопасная конверсия — если курс недоступен, возвращаем 0."""
    try:
        return exchange_svc.convert(db, amount, currency, main)
    except exchange_svc.ExchangeError:
        return 0.0


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    main = accounts_svc.get_user_main_currency(db, user_id)
    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year

    # 1. Счета — каждый со своим total_in_main
    accounts = db.query(Account).filter(Account.user_id == user_id).all()
    accounts_serialized = [
        accounts_svc.serialize_account(db, a, main) for a in accounts
    ]
    total_balance = sum(a.total_in_main for a in accounts_serialized)

    accounts_summary = [
        AccountSummary(
            id=a.id, name=a.name, total_in_main=a.total_in_main,
            type=a.type, color=a.color, icon=a.icon,
        )
        for a in accounts_serialized
    ]

    # 2. Месячные доходы/расходы — конвертим каждую транзакцию в main
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
        _to_main(db, t.amount, t.currency, main)
        for t in month_transactions if t.type == TransactionType.income
    )
    month_expense = sum(
        _to_main(db, t.amount, t.currency, main)
        for t in month_transactions if t.type == TransactionType.expense
    )

    # 3. Топ категорий по расходам — конвертим каждую транзакцию
    expense_tx = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.expense,
        )
        .all()
    )
    by_category: dict[Optional[int], float] = {}
    for t in expense_tx:
        by_category[t.category_id] = by_category.get(t.category_id, 0.0) + _to_main(
            db, t.amount, t.currency, main
        )

    categories_map = {
        c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }
    sorted_cats = sorted(by_category.items(), key=lambda x: x[1], reverse=True)[:5]
    top_categories = []
    for cat_id, total in sorted_cats:
        cat = categories_map.get(cat_id)
        top_categories.append(
            CategoryStat(
                category_id=cat_id,
                category_name=cat.name if cat else "Без категории",
                category_color=cat.color if cat else "#94a3b8",
                category_icon=cat.icon if cat else None,
                total=round(total, 2),
            )
        )

    # 4. Месячный тренд (6 мес) — конвертим каждую транзакцию
    all_tx = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    monthly_map: dict[str, dict] = {}
    for t in all_tx:
        key = f"{t.date.year:04d}-{t.date.month:02d}"
        if key not in monthly_map:
            monthly_map[key] = {"income": 0.0, "expense": 0.0}
        in_main = _to_main(db, t.amount, t.currency, main)
        if t.type == TransactionType.income:
            monthly_map[key]["income"] += in_main
        elif t.type == TransactionType.expense:
            monthly_map[key]["expense"] += in_main

    monthly_stats = [
        MonthStat(month=k, income=round(v["income"], 2), expense=round(v["expense"], 2))
        for k, v in sorted(monthly_map.items())
    ][-6:]

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
                currency=t.currency,
                type=t.type.value,
                description=t.description,
                date=t.date,
                account_name=acc.name if acc else "—",
                category_name=cat.name if cat else None,
                category_icon=cat.icon if cat else None,
            )
        )

    return DashboardResponse(
        main_currency=main,
        total_balance=round(total_balance, 2),
        month_income=round(month_income, 2),
        month_expense=round(month_expense, 2),
        accounts=accounts_summary,
        top_categories=top_categories,
        monthly_stats=monthly_stats,
        recent_transactions=recent_transactions,
    )
