from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.billing import BillingActionResponse, BillingOverview, CheckoutRequest, CheckoutResponse, PlanResponse, TestFamilyCheckoutRequest
from app.operations.billing import queries, commands


router = APIRouter(prefix="/api/billing", tags=["billing"])

def current_user(user_id: int = Depends(current_user_id), db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

@router.get("/plans", response_model=list[PlanResponse])
def plans(user: User = Depends(current_user)):
    return operation_response(queries.plans(user=user))


@router.get("/overview", response_model=BillingOverview)
def overview(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return operation_response(queries.overview(db=db, user=user))


@router.post("/test-family", response_model=BillingActionResponse)
def activate_test_family(
    data: TestFamilyCheckoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return operation_response(commands.activate_test_family(data=data, db=db, user=user))


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(data: CheckoutRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return operation_response(commands.checkout(data=data, db=db, user=user))


@router.post("/refresh", response_model=BillingActionResponse)
def refresh_payment(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return operation_response(commands.refresh_payment(db=db, user=user))


@router.post("/cancel", response_model=BillingActionResponse)
def cancel(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return operation_response(commands.cancel(db=db, user=user))


@router.post("/resume", response_model=BillingActionResponse)
def resume(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return operation_response(commands.resume(db=db, user=user))


@router.post("/webhook/yookassa", include_in_schema=False)
async def yookassa_webhook(request: Request, db: Session = Depends(get_db)):
    return operation_response(await commands.yookassa_webhook(request=request, db=db))
