from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as _current_user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.financial_dependencies import financial_db
from app.schemas.automation import AutomationSettings, AutomationSettingsUpdate, CategoryRuleCreate, CategoryRuleResponse, CategorySuggestion, DuplicateGroupResponse, RegularPaymentSuggestion
from app.operations.automation import queries, commands


router = APIRouter(prefix="/api/automation", tags=["automation"])

@router.get("/settings", response_model=AutomationSettings)
def get_settings(db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(_current_user_id)):
    return operation_response(queries.get_settings(db=db, user_id=user_id))


@router.patch("/settings", response_model=AutomationSettings)
def update_settings(data: AutomationSettingsUpdate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(_current_user_id)):
    return operation_response(commands.update_settings(data=data, db=db, user_id=user_id))


@router.get("/rules", response_model=list[CategoryRuleResponse])
def get_rules(db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(_current_user_id)):
    return operation_response(queries.get_rules(db=db, user_id=user_id))


@router.post("/rules", response_model=CategoryRuleResponse, status_code=201)
def create_rule(data: CategoryRuleCreate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(_current_user_id)):
    return operation_response(commands.create_rule(data=data, db=db, user_id=user_id))


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(_current_user_id)):
    return operation_response(commands.delete_rule(rule_id=rule_id, db=db, user_id=user_id))


@router.get("/category-suggestion", response_model=CategorySuggestion | None)
def category_suggestion(
    description: str,
    transaction_type: str = "expense",
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(_current_user_id),
):
    return operation_response(queries.category_suggestion(description=description, transaction_type=transaction_type, db=db, user_id=user_id))


@router.get("/duplicates", response_model=list[DuplicateGroupResponse])
def possible_duplicates(db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(_current_user_id)):
    'Potential duplicates for review; nothing is deleted or merged automatically.'
    return operation_response(queries.possible_duplicates(db=db, user_id=user_id))


@router.get("/regular-payments", response_model=list[RegularPaymentSuggestion])
def regular_payments(db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(_current_user_id)):
    'Suggestions only: the user decides whether to create a schedule.'
    return operation_response(queries.regular_payments(db=db, user_id=user_id))
