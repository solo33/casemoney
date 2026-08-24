from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.services import app_config as app_config_svc


PERSONAL_PLAN = "personal"
FAMILY_PLAN = "family"


def has_family_plan(db: Session, user_id: int) -> bool:
    # Launch mode: billing is off, so Family is free for everyone. This is the
    # single switch — flip app_config.billing_enabled to require the real plan.
    if not app_config_svc.is_billing_enabled(db):
        return True
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
