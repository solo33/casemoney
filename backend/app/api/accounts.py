from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.account import Account
from app.models.account_group import AccountGroup
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountGroupBucket,
    GroupSummary,
)
from app.services.auth import decode_token

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _validate_group(db: Session, user_id: int, group_id: Optional[int]) -> None:
    """Проверяет что группа существует и принадлежит пользователю."""
    if group_id is None:
        return
    exists = db.query(AccountGroup).filter(
        AccountGroup.id == group_id,
        AccountGroup.user_id == user_id,
    ).first()
    if not exists:
        raise HTTPException(status_code=400, detail="Group not found")


@router.get("/", response_model=List[AccountResponse])
def get_accounts(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """Плоский список — для select-форм и старых клиентов."""
    return db.query(Account).filter(Account.user_id == user_id).all()


@router.get("/grouped", response_model=List[AccountGroupBucket])
def get_accounts_grouped(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Сгруппированный список: каждая группа со своими счетами и суммой балансов.
    Счета без группы попадают в виртуальную группу 'Без группы' (id=None)."""
    groups = (
        db.query(AccountGroup)
        .filter(AccountGroup.user_id == user_id)
        .order_by(AccountGroup.sort_order, AccountGroup.id)
        .all()
    )
    accounts = db.query(Account).filter(Account.user_id == user_id).all()

    by_group: dict[Optional[int], list[Account]] = {}
    for a in accounts:
        by_group.setdefault(a.group_id, []).append(a)

    result: list[AccountGroupBucket] = []
    for g in groups:
        bucket_accounts = by_group.get(g.id, [])
        result.append(AccountGroupBucket(
            group=GroupSummary(id=g.id, name=g.name, sort_order=g.sort_order),
            accounts=[AccountResponse.model_validate(a) for a in bucket_accounts],
            total_balance=round(sum(a.balance for a in bucket_accounts), 2),
        ))

    # Счета без группы — виртуальная группа (всегда последняя)
    ungrouped = by_group.get(None, [])
    if ungrouped:
        result.append(AccountGroupBucket(
            group=GroupSummary(id=None, name="Без группы", sort_order=10_000),
            accounts=[AccountResponse.model_validate(a) for a in ungrouped],
            total_balance=round(sum(a.balance for a in ungrouped), 2),
        ))

    return result


@router.post("/", response_model=AccountResponse, status_code=201)
def create_account(
    data: AccountCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    _validate_group(db, user_id, data.group_id)
    account = Account(**data.model_dump(), user_id=user_id)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == user_id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    update_fields = data.model_dump(exclude_unset=True)
    if "group_id" in update_fields:
        _validate_group(db, user_id, update_fields["group_id"])

    for key, value in update_fields.items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == user_id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
