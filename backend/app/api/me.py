"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.user import UserResponse, UserUpdate, PasswordChange
from app.operations.me import queries, commands


security = HTTPBearer()

router = APIRouter(prefix="/api/me", tags=["me"])

@router.get("/", response_model=UserResponse)
def get_me(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return queries.get_me(db=db, user_id=user_id)


@router.put("/", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.update_me(data=data, db=db, user_id=user_id)


@router.post("/password", status_code=204)
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.change_password(data=data, db=db, user_id=user_id)


@router.delete("/transactions", status_code=204)
def delete_all_transactions(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Удаляет ВСЕ транзакции пользователя. Балансы счетов обнуляются.'
    return commands.delete_all_transactions(db=db, user_id=user_id)


@router.post("/reset", status_code=204)
def reset_account(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Удаляет ВСЕ данные пользователя кроме самого аккаунта.\n\n    Удаляются: транзакции, балансы, счета, группы счетов, категории, валюты.\n    '
    return commands.reset_account(db=db, user_id=user_id)


@router.get("/limits")
def get_limits(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Текущее использование + активный тариф.'
    return queries.get_limits(db=db, user_id=user_id)


@router.delete("/", status_code=204)
def delete_account(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Полностью удаляет пользователя и все его данные.'
    return commands.delete_account(db=db, user_id=user_id)
