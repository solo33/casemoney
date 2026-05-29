from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.account_group import AccountGroup
from app.schemas.account_group import (
    AccountGroupCreate,
    AccountGroupUpdate,
    AccountGroupResponse,
)
from app.services.auth import decode_token

router = APIRouter(prefix="/api/account-groups", tags=["account-groups"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


@router.get("/", response_model=List[AccountGroupResponse])
def get_groups(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return (
        db.query(AccountGroup)
        .filter(AccountGroup.user_id == user_id)
        .order_by(AccountGroup.sort_order, AccountGroup.id)
        .all()
    )


@router.post("/", response_model=AccountGroupResponse, status_code=201)
def create_group(
    data: AccountGroupCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    group = AccountGroup(**data.model_dump(), user_id=user_id)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.put("/{group_id}", response_model=AccountGroupResponse)
def update_group(
    group_id: int,
    data: AccountGroupUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    group = db.query(AccountGroup).filter(
        AccountGroup.id == group_id,
        AccountGroup.user_id == user_id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(group, key, value)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Удаление группы. Связанные счета остаются (FK ON DELETE SET NULL)."""
    group = db.query(AccountGroup).filter(
        AccountGroup.id == group_id,
        AccountGroup.user_id == user_id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(group)
    db.commit()
