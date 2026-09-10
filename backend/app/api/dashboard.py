from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.financial_dependencies import financial_db
from app.operations.dashboard import queries
from app.schemas.dashboard_views import DashboardResponse


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    forecast_days: int = Query(30, ge=1, le=365),
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(queries.get_dashboard(forecast_days=forecast_days, db=db, user_id=user_id))
