from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.recurring_transaction import RecurringTransactionCreate, RecurringTransactionResponse, RecurringTransactionRunResponse, RecurringTransactionUpdate
from app.operations.recurring_transactions import queries, commands


router = APIRouter(prefix="/api/recurring-transactions", tags=["recurring transactions"])

@router.get("/", response_model=List[RecurringTransactionResponse])
def list_recurring_transactions(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(queries.list_recurring_transactions(db=db, user_id=user_id))


@router.post("/", response_model=RecurringTransactionResponse, status_code=201)
def create_recurring_transaction(data: RecurringTransactionCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.create_recurring_transaction(data=data, db=db, user_id=user_id))


@router.patch("/{recurring_id}", response_model=RecurringTransactionResponse)
def update_recurring_transaction(recurring_id: int, data: RecurringTransactionUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.update_recurring_transaction(recurring_id=recurring_id, data=data, db=db, user_id=user_id))


@router.post("/{recurring_id}/skip", response_model=RecurringTransactionResponse)
def skip_next_recurring_transaction(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    'Skip only the nearest occurrence and retain the rest of the schedule.'
    return operation_response(commands.skip_next_recurring_transaction(recurring_id=recurring_id, db=db, user_id=user_id))


@router.post("/{recurring_id}/finish", response_model=RecurringTransactionResponse)
def finish_recurring_transaction(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.finish_recurring_transaction(recurring_id=recurring_id, db=db, user_id=user_id))


@router.get("/{recurring_id}/runs", response_model=List[RecurringTransactionRunResponse])
def recurring_transaction_runs(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(queries.recurring_transaction_runs(recurring_id=recurring_id, db=db, user_id=user_id))


@router.delete("/{recurring_id}", status_code=204)
def delete_recurring_transaction(recurring_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.delete_recurring_transaction(recurring_id=recurring_id, db=db, user_id=user_id))
