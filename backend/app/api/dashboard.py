from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, selectinload
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
    account_id: int
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
    recently_changed: List[RecentTransaction]  # последние изменённые (по updated_at)


def _to_main(db: Session, user_id: int, amount: float, currency: str, main: str) -> float:
    """Безопасная конверсия с учётом ручных курсов пользователя."""
    try:
        return exchange_svc.convert_for_user(db, user_id, amount, currency, main)
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
    accounts = (
        db.query(Account)
        .options(selectinload(Account.balances))
        .filter(Account.user_id == user_id)
        .all()
    )
    accounts_svc.prime_account_rates(db, accounts, main)
    accounts_serialized = [
        accounts_svc.serialize_account(db, a, main) for a in accounts
    ]
    # В общий баланс попадают только счета с include_in_balance=True
    total_balance = sum(
        a.total_in_main for a in accounts_serialized if a.include_in_balance
    )

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
    exchange_svc.prime_user_rates(
        db,
        user_id,
        {transaction.currency for transaction in month_transactions},
        main,
    )

    month_income = sum(
        _to_main(db, user_id, t.amount, t.currency, main)
        for t in month_transactions if t.type == TransactionType.income and not t.is_financing
    )
    month_expense = sum(
        _to_main(db, user_id, t.amount, t.currency, main)
        for t in month_transactions if t.type == TransactionType.expense
    )

    categories_map = {
        c.id: c for c in db.query(Category).filter(Category.user_id == user_id).all()
    }
    # Подробные категории и месячный тренд грузятся отдельными report-эндпоинтами.
    # На главной это резко сокращает ожидание для аккаунтов с большой историей.
    top_categories = []
    monthly_stats = []

    # 5. Последние 10 транзакций
    recent_rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.date.desc())
        .limit(10)
        .all()
    )
    accounts_map = {a.id: a for a in accounts}

    def _serialize_tx(t) -> RecentTransaction:
        acc = accounts_map.get(t.account_id)
        cat = categories_map.get(t.category_id) if t.category_id else None
        return RecentTransaction(
            id=t.id,
            amount=t.amount,
            currency=t.currency,
            type=t.type.value,
            description=t.description,
            date=t.date,
            account_id=t.account_id,
            account_name=acc.name if acc else "—",
            category_name=cat.name if cat else None,
            category_icon=cat.icon if cat else None,
        )

    recent_transactions = [_serialize_tx(t) for t in recent_rows]

    # 6. Последние изменённые — по updated_at (fallback на date через coalesce).
    # После импорта у тысяч записей updated_at совпадает с точностью до секунды —
    # без tie-break по дате операции порядок внутри пачки произвольный (могут
    # всплыть записи 2012 года). Свежие операции — выше.
    changed_rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(
            func.coalesce(Transaction.updated_at, Transaction.date).desc(),
            Transaction.date.desc(),
            Transaction.id.desc(),
        )
        .limit(8)
        .all()
    )
    recently_changed = [_serialize_tx(t) for t in changed_rows]

    return DashboardResponse(
        main_currency=main,
        total_balance=round(total_balance, 2),
        month_income=round(month_income, 2),
        month_expense=round(month_expense, 2),
        accounts=accounts_summary,
        top_categories=top_categories,
        monthly_stats=monthly_stats,
        recent_transactions=recent_transactions,
        recently_changed=recently_changed,
    )
