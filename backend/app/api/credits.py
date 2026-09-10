from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.dependencies import require_family_user_id
from app.api.financial_dependencies import financial_db
from app.schemas.credit import CreditCreate, CreditPaymentCreate, CreditPaymentResponse, MortgagePaymentPreview, CreditResponse, CreditSummary, CreditUpdate, MortgageScheduleResponse
from app.operations.credits import queries, commands


router = APIRouter(prefix="/api/credits", tags=["credits"])

@router.get("/", response_model=list[CreditResponse])
def list_credits(
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(queries.list_credits(db=db, user_id=user_id))


@router.get("/summary", response_model=CreditSummary)
def credit_summary(
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(queries.credit_summary(db=db, user_id=user_id))


@router.post("/", response_model=CreditResponse, status_code=201)
def create_credit(
    data: CreditCreate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(commands.create_credit(data=data, db=db, user_id=user_id))


@router.patch("/{credit_id}", response_model=CreditResponse)
def update_credit(
    credit_id: int,
    data: CreditUpdate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(commands.update_credit(credit_id=credit_id, data=data, db=db, user_id=user_id))


@router.delete("/{credit_id}", status_code=204)
def delete_credit(
    credit_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    'Delete an obligation together with the ledger entries created for it.\n\n    Credit payments are not standalone operations: deleting only their records\n    would leave expenses/income in account balances.  Revert and remove every\n    linked transaction in the same database transaction instead.\n    '
    return operation_response(commands.delete_credit(credit_id=credit_id, db=db, user_id=user_id))


@router.get("/{credit_id}/schedule", response_model=MortgageScheduleResponse)
def mortgage_schedule(
    credit_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(queries.mortgage_schedule(credit_id=credit_id, db=db, user_id=user_id))


@router.get("/{credit_id}/payment-preview", response_model=MortgagePaymentPreview)
def mortgage_payment_preview(
    credit_id: int,
    amount: float,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    'Server-side source of truth for the mortgage payment split.'
    return operation_response(queries.mortgage_payment_preview(credit_id=credit_id, amount=amount, db=db, user_id=user_id))


@router.post("/{credit_id}/payments", response_model=CreditPaymentResponse, status_code=201)
def register_payment(
    credit_id: int,
    data: CreditPaymentCreate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(commands.register_payment(credit_id=credit_id, data=data, db=db, user_id=user_id))
