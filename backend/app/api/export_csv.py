"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.operations.export_csv import queries


router = APIRouter(prefix="/api/export", tags=["export"])

@router.get("/csv")
def export_csv(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Скачать CSV всех транзакций пользователя.\n\n    Формат совместим с /api/import/preview: date;account;category;amount;currency;description;transfer\n    '
    return queries.export_csv(date_from=date_from, date_to=date_to, db=db, user_id=user_id)
