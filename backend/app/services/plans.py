from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User


PERSONAL_PLAN = "personal"
FAMILY_PLAN = "family"


def has_family_plan(db: Session, user_id: int) -> bool:
    return db.query(User.id).filter(
        User.id == user_id,
        User.plan == FAMILY_PLAN,
    ).first() is not None


def ensure_family_plan(db: Session, user_id: int) -> None:
    if not has_family_plan(db, user_id):
        raise HTTPException(
            status_code=403,
            detail="Семейные функции доступны только на тарифе Family",
        )
