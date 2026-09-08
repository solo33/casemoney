"""Accounts: common. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.models.account import Account
from app.models.account_group import AccountGroup
from app.services import family_accounts as family_accounts_svc



def _validate_group(db: Session, user_id: int, group_id: Optional[int]) -> None:
    if group_id is None:
        return
    exists = db.query(AccountGroup).filter(
        AccountGroup.id == group_id,
        AccountGroup.user_id == user_id,
    ).first()
    if not exists:
        raise HTTPException(status_code=400, detail="Group not found")


def _get_account(db: Session, account_id: int, user_id: int) -> Account:
    return family_accounts_svc.require_read_access(db, account_id, user_id)


def _get_owned_account(db: Session, account_id: int, user_id: int) -> Account:
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == user_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account
