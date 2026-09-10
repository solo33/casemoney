from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.financial_dependencies import financial_db
from app.operations.export_csv import queries


router = APIRouter(prefix="/api/export", tags=["export"])

@router.get("/csv")
def export_csv(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    'Скачать CSV всех транзакций пользователя.\n\n    Формат совместим с /api/import/preview: date;account;category;amount;currency;description;transfer\n    '
    return operation_response(queries.export_csv(date_from=date_from, date_to=date_to, db=db, user_id=user_id))
