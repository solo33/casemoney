"""Права доступа к общим счетам Family.

Личные счета никогда не становятся видны по умолчанию: запись доступа создаёт
владелец конкретного счёта, а не просто владелец семейного пространства.
"""

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.family import AccountFamilyAccess, FamilyMember


def active_membership(db: Session, user_id: int) -> Optional[FamilyMember]:
    return db.query(FamilyMember).filter(
        FamilyMember.user_id == user_id,
        FamilyMember.status == "active",
    ).first()


def access_level(db: Session, account: Account, user_id: int) -> Optional[str]:
    if account.user_id == user_id:
        return "owner"
    if not account.is_shared or not account.family_id:
        return None
    membership = active_membership(db, user_id)
    if not membership or membership.family_id != account.family_id:
        return None
    item = db.query(AccountFamilyAccess).filter(
        AccountFamilyAccess.account_id == account.id,
        AccountFamilyAccess.user_id == user_id,
    ).first()
    return item.permission if item else None


def accessible_accounts(db: Session, user_id: int):
    shared_ids = db.query(AccountFamilyAccess.account_id).filter(
        AccountFamilyAccess.user_id == user_id
    )
    return db.query(Account).filter(
        or_(Account.user_id == user_id, Account.id.in_(shared_ids))
    )


def require_read_access(db: Session, account_id: int, user_id: int) -> Account:
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account or not access_level(db, account, user_id):
        raise HTTPException(status_code=404, detail="Счёт не найден")
    return account


def require_write_access(db: Session, account_id: int, user_id: int) -> Account:
    account = require_read_access(db, account_id, user_id)
    if access_level(db, account, user_id) not in {"owner", "editor"}:
        raise HTTPException(status_code=403, detail="Для этого счёта доступно только чтение")
    return account
