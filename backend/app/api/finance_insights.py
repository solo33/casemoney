"""Safe, finance-only insights for Family accounts.

This is deliberately not a general-purpose chat endpoint.  It receives no
free-text prompt and reads only the authenticated user's own aggregated
transactions.  That keeps the feature useful without turning CaseMoney into a
general AI gateway or sending account details and merchant notes to a model.
"""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc
from app.services.auth import decode_token
from app.services.plans import ensure_family_plan


router = APIRouter(prefix="/api/finance-insights", tags=["finance insights"])
security = HTTPBearer()


def current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


class InsightRequest(BaseModel):
    period_days: Literal[30, 90, 365] = 30


class InsightItem(BaseModel):
    kind: Literal["positive", "warning", "neutral"]
    title: str
    message: str


class InsightResponse(BaseModel):
    currency: str
    period_days: int
    income: float
    expense: float
    net: float
    insights: list[InsightItem]


def _totals(db: Session, user_id: int, start: datetime, end: datetime, currency: str):
    rows = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.date >= start,
        Transaction.date < end,
        Transaction.is_planned.is_(False),
        Transaction.is_financing.is_(False),
        Transaction.type.in_([TransactionType.income, TransactionType.expense]),
    ).all()
    income = expense = 0.0
    categories: dict[int | None, float] = {}
    for item in rows:
        try:
            amount = exchange_svc.convert_for_user(db, user_id, item.amount, item.currency, currency)
        except exchange_svc.ExchangeError:
            continue
        if item.type == TransactionType.income:
            income += amount
        else:
            expense += amount
            categories[item.category_id] = categories.get(item.category_id, 0.0) + amount
    return round(income, 2), round(expense, 2), categories


@router.post("/summary", response_model=InsightResponse)
def finance_summary(
    data: InsightRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    """Return bounded, explainable financial observations for a fixed period."""
    ensure_family_plan(db, user_id)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=data.period_days)
    previous_start = start - timedelta(days=data.period_days)
    currency = accounts_svc.get_user_main_currency(db, user_id)
    income, expense, categories = _totals(db, user_id, start, now, currency)
    prev_income, prev_expense, _ = _totals(db, user_id, previous_start, start, currency)

    insights: list[InsightItem] = []
    net = round(income - expense, 2)
    if income == 0 and expense == 0:
        insights.append(InsightItem(
            kind="neutral",
            title="Пока недостаточно операций",
            message="Добавьте несколько доходов или расходов — тогда появятся персональные финансовые наблюдения.",
        ))
    else:
        if net >= 0:
            insights.append(InsightItem(
                kind="positive",
                title="Доходы покрывают расходы",
                message=f"За последние {data.period_days} дней разница составляет {net:,.0f} {currency}.",
            ))
        else:
            insights.append(InsightItem(
                kind="warning",
                title="Расходы выше доходов",
                message=f"За последние {data.period_days} дней расходов больше на {abs(net):,.0f} {currency}.",
            ))

        if prev_expense > 0:
            change = round((expense - prev_expense) / prev_expense * 100)
            if change >= 15:
                insights.append(InsightItem(
                    kind="warning",
                    title="Расходы выросли",
                    message=f"По сравнению с предыдущими {data.period_days} днями рост составил {change}%.",
                ))
            elif change <= -15:
                insights.append(InsightItem(
                    kind="positive",
                    title="Расходы снизились",
                    message=f"По сравнению с предыдущими {data.period_days} днями снижение составило {abs(change)}%.",
                ))

        if categories and expense > 0:
            category_ids = [item for item in categories if item is not None]
            names = dict(db.query(Category.id, Category.name).filter(Category.id.in_(category_ids)).all()) if category_ids else {}
            category_id, top_amount = max(categories.items(), key=lambda item: item[1])
            name = names.get(category_id, "Без категории")
            share = round(top_amount / expense * 100)
            insights.append(InsightItem(
                kind="neutral",
                title=f"Главная статья расходов — {name}",
                message=f"На неё пришлось {share}% расходов ({top_amount:,.0f} {currency}) за выбранный период.",
            ))

    return InsightResponse(
        currency=currency,
        period_days=data.period_days,
        income=income,
        expense=expense,
        net=net,
        insights=insights[:3],
    )
