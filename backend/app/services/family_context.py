"""Family membership, payloads and the legacy accounting projection."""
from datetime import datetime, timezone
from typing import Optional
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.family import Family, FamilyExpenseAccounting, FamilyMember
from app.models.transaction import Transaction
from app.models.user import User



FAMILY_MAX_MEMBERS = 3


def _filter_month(query, year, month):
    if year is None and month is None:
        return query
    if year is None or month is None or not 2000 <= year <= 2200 or not 1 <= month <= 12:
        raise ApplicationError(status_code=422, detail="Укажите корректные год и месяц")
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=timezone.utc)
    return query.filter(Transaction.date >= start, Transaction.date < end)


def active_membership(db: Session, user_id: int) -> Optional[FamilyMember]:
    return db.query(FamilyMember).filter(
        FamilyMember.user_id == user_id,
        FamilyMember.status == "active",
    ).first()


def require_membership(db: Session, user_id: int) -> FamilyMember:
    member = active_membership(db, user_id)
    if not member:
        raise ApplicationError(status_code=404, detail="Семейное пространство не настроено")
    return member


def _user_label(user: Optional[User], email: str) -> str:
    if user and user.username:
        return user.username
    return email


def family_payload(db: Session, family: Family, current_user_id: int) -> dict:
    members = db.query(FamilyMember).filter(
        FamilyMember.family_id == family.id
    ).order_by(FamilyMember.id).all()
    users = {
        user.id: user
        for user in db.query(User).filter(
            User.id.in_([m.user_id for m in members if m.user_id])
        ).all()
    }
    return {
        "id": family.id,
        "name": family.name,
        "owner_user_id": family.owner_user_id,
        "current_user_id": current_user_id,
        "current_user_role": next(
            (m.role for m in members if m.user_id == current_user_id), None
        ),
        "members": [
            {
                "id": member.id,
                "user_id": member.user_id,
                "email": member.email,
                "name": _user_label(users.get(member.user_id), member.email),
                "role": member.role,
                "status": member.status,
            }
            for member in members
        ],
    }


def require_family_owner(db: Session, user_id: int) -> FamilyMember:
    membership = require_membership(db, user_id)
    if membership.role != "owner":
        raise ApplicationError(status_code=403, detail="Это действие доступно владельцу семейного пространства")
    return membership


def accounting_rows_query(db: Session, family_id: int):
    """Read existing accounting rows without writing or committing anything."""
    return db.query(FamilyExpenseAccounting).filter(
        FamilyExpenseAccounting.family_id == family_id
    )
