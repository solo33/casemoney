from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import require_family_user_id
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.financial_dependencies import financial_db
from app.schemas.budget import BudgetCreate, BudgetResponse, BudgetSuggestion, BudgetUpdate
from app.operations.budgets import queries, commands


router = APIRouter(prefix="/api/budgets", tags=["budgets"])

@router.get("/", response_model=list[BudgetResponse])
def list_budgets(
    period: str = Query("month"),
    anchor: date | None = Query(None),
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(queries.list_budgets(period=period, anchor=anchor, db=db, user_id=user_id))


@router.get("/suggestions", response_model=list[BudgetSuggestion])
def budget_suggestions(
    period: str = Query("month"),
    anchor: date | None = Query(None),
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(require_family_user_id),
):
    return operation_response(queries.budget_suggestions(period=period, anchor=anchor, db=db, user_id=user_id))


@router.post("/", response_model=BudgetResponse, status_code=201)
def create_budget(data: BudgetCreate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(require_family_user_id)):
    return operation_response(commands.create_budget(data=data, db=db, user_id=user_id))


@router.patch("/{budget_id}", response_model=BudgetResponse)
def update_budget(budget_id: int, data: BudgetUpdate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(require_family_user_id)):
    return operation_response(commands.update_budget(budget_id=budget_id, data=data, db=db, user_id=user_id))


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(require_family_user_id)):
    return operation_response(commands.delete_budget(budget_id=budget_id, db=db, user_id=user_id))
