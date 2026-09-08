from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.auth import decode_token
from app.operations.finance_insights import commands
from app.schemas.finance_insights_views import InsightRequest, InsightResponse


security = HTTPBearer()

router = APIRouter(prefix="/api/finance-insights", tags=["finance insights"])

def current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])

@router.post("/summary", response_model=InsightResponse)
def finance_summary(
    data: InsightRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    'Return bounded, explainable financial observations for a fixed period.'
    return operation_response(commands.finance_summary(data=data, db=db, user_id=user_id))
