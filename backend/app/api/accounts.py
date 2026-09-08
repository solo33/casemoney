from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.account import AccountCreate, AccountUpdate, AccountResponse, AccountBalanceCreate, AccountBalanceUpdate, AccountBalanceAdjustmentCreate, AccountBalanceAdjustmentResponse, AccountBalanceResponse, AccountGroupBucket
from app.operations.accounts import queries, commands, balances


router = APIRouter(prefix="/api/accounts", tags=["accounts"])

@router.get("/", response_model=List[AccountResponse])
def get_accounts(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Плоский список со всеми балансами и total_in_main.'
    return operation_response(queries.get_accounts(db=db, user_id=user_id))


@router.get("/grouped", response_model=List[AccountGroupBucket])
def get_accounts_grouped(
    convert_balances: bool = True,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Сгруппированный список. total_in_main для группы = сумма total_in_main счетов.'
    return operation_response(queries.get_accounts_grouped(convert_balances=convert_balances, db=db, user_id=user_id))


@router.post("/", response_model=AccountResponse, status_code=201)
def create_account(
    data: AccountCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.create_account(data=data, db=db, user_id=user_id))


@router.post("/reorder", status_code=204)
def reorder_accounts(
    payload: dict,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Задать порядок счетов. body: {"account_ids": [id, id, ...]} —\n    sort_order назначается по позиции в списке. Опционально {"group_id": X}\n    одновременно переносит все эти счета в указанную группу.'
    return operation_response(commands.reorder_accounts(payload=payload, db=db, user_id=user_id))


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.update_account(account_id=account_id, data=data, db=db, user_id=user_id))


@router.delete("/{account_id}", status_code=204)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.delete_account(account_id=account_id, db=db, user_id=user_id))


@router.get("/{account_id}/balances", response_model=List[AccountBalanceResponse])
def list_balances(
    account_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(queries.list_balances(account_id=account_id, db=db, user_id=user_id))


@router.post("/{account_id}/balances", response_model=AccountBalanceResponse, status_code=201)
def add_balance(
    account_id: int,
    data: AccountBalanceCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(balances.add_balance(account_id=account_id, data=data, db=db, user_id=user_id))


@router.put("/{account_id}/balances/{currency}", response_model=AccountBalanceResponse)
def update_balance(
    account_id: int,
    currency: str,
    data: AccountBalanceUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(balances.update_balance(account_id=account_id, currency=currency, data=data, db=db, user_id=user_id))


@router.post(
    "/{account_id}/balances/{currency}/adjust",
    response_model=AccountBalanceAdjustmentResponse,
    status_code=201,
)
def adjust_balance(
    account_id: int,
    currency: str,
    data: AccountBalanceAdjustmentCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Создаёт доход/расход на разницу между фактическим и указанным остатком.'
    return operation_response(balances.adjust_balance(account_id=account_id, currency=currency, data=data, db=db, user_id=user_id))


@router.delete("/{account_id}/balances/{currency}", status_code=204)
def delete_balance(
    account_id: int,
    currency: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(balances.delete_balance(account_id=account_id, currency=currency, db=db, user_id=user_id))
