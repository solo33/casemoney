"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as _user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.operations.finance_ai import commands
from app.schemas.finance_ai_views import FinanceAiRequest, FinanceAiResponse


router = APIRouter(prefix="/api/finance-ai", tags=["finance ai"])

@router.post("/insight", response_model=FinanceAiResponse)
async def finance_ai_insight(
    data: FinanceAiRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(_user_id),
):
    return await commands.finance_ai_insight(data=data, db=db, user_id=user_id)
