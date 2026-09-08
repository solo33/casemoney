"""Finance_insights: common. Callers supply resolved user and database session."""
from datetime import datetime
from sqlalchemy.orm import Session
from app.services.finance_period import financial_period_totals



def _totals(db: Session, user_id: int, start: datetime, end: datetime, currency: str):
    totals = financial_period_totals(
        db, user_id, start, end, currency, include_expense_categories=True,
    )
    return totals.income, totals.expense, totals.expense_categories or {}
