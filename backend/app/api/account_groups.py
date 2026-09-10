from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.api.financial_dependencies import financial_db
from app.schemas.account_group import AccountGroupCreate, AccountGroupUpdate, AccountGroupResponse
from app.operations.account_groups import queries, commands


router = APIRouter(prefix="/api/account-groups", tags=["account-groups"])

@router.get("/", response_model=List[AccountGroupResponse])
def get_groups(
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(queries.get_groups(db=db, user_id=user_id))


@router.post("/", response_model=AccountGroupResponse, status_code=201)
def create_group(
    data: AccountGroupCreate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.create_group(data=data, db=db, user_id=user_id))


@router.put("/{group_id}", response_model=AccountGroupResponse)
def update_group(
    group_id: int,
    data: AccountGroupUpdate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.update_group(group_id=group_id, data=data, db=db, user_id=user_id))


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    'Удаление группы. Связанные счета остаются (FK ON DELETE SET NULL).'
    return operation_response(commands.delete_group(group_id=group_id, db=db, user_id=user_id))
