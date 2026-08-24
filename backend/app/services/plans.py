from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.family import Family, FamilyMember
from app.services import app_config as app_config_svc


PERSONAL_PLAN = "personal"
FAMILY_PLAN = "family"


def has_family_plan(db: Session, user_id: int) -> bool:
    # Launch mode: billing is off, so Family is free for everyone. This is the
    # single switch — flip app_config.billing_enabled to require the real plan.
    if not app_config_svc.is_billing_enabled(db):
        return True
    if db.query(User.id).filter(
        User.id == user_id,
        User.plan == FAMILY_PLAN,
    ).first() is not None:
        return True

    # Family оплачивает владелец пространства: приглашённым участникам не нужна
    # отдельная подписка. В бесплатном режиме до этого блока дело не доходит.
    return db.query(FamilyMember.id).join(
        Family, Family.id == FamilyMember.family_id
    ).join(
        User, User.id == Family.owner_user_id
    ).filter(
        FamilyMember.user_id == user_id,
        # Pending invitees need this temporary access solely to open the
        # invitation screen and accept it. Other family endpoints still check
        # an active membership themselves.
        FamilyMember.status.in_(("active", "pending")),
        User.plan == FAMILY_PLAN,
    ).first() is not None


def ensure_family_plan(db: Session, user_id: int) -> None:
    if not has_family_plan(db, user_id):
        raise HTTPException(
            status_code=403,
            detail="Семейные функции доступны только на тарифе Family",
        )
