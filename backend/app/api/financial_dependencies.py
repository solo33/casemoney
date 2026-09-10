"""Explicit preparation and persistence for exchange-backed HTTP operations."""
from fastapi import Depends
from sqlalchemy.orm import Session
from app.api.dependencies import current_user_id
from app.database import get_db
from app.operations.exchange.read_preparation import finish_exchange_work, prepare_report_snapshots
from app.services.exchange import invalidate_user_rates


def financial_db(db: Session = Depends(get_db)):
    try:
        yield db
        finish_exchange_work(db)
    except Exception:
        db.rollback()
        invalidate_user_rates()
        raise


def report_db(
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(current_user_id),
):
    prepare_report_snapshots(db, user_id)
    return db
