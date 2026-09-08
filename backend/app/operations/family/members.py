"""Family: members. Callers supply resolved user and database session."""
from datetime import datetime, timezone
import html
from app.application import ApplicationError
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.family import Family, FamilyMember
from app.models.user import User
from app.services.email import app_url, send_email
from app.services.notifications import notify_family_members, notify_user
from app.services import app_config as app_config_svc
from app.services.family_context import require_family_owner, active_membership, family_payload, require_membership, FAMILY_MAX_MEMBERS
from app.schemas.family_views import FamilyCreate, InviteCreate, MemberRoleUpdate


def get_family(db: Session=None, user_id: int=None):
    user = db.query(User).filter(User.id == user_id).first()
    member = active_membership(db, user_id)
    pending = db.query(FamilyMember).filter(
        FamilyMember.status == "pending",
        func.lower(FamilyMember.email) == user.email.lower(),
    ).all()
    if not member:
        return {
            "family": None,
            "pending_invitations": [
                {
                    "id": invitation.id,
                    "family_id": invitation.family_id,
                    "family_name": db.query(Family.name).filter(
                        Family.id == invitation.family_id
                    ).scalar(),
                    "email": invitation.email,
                }
                for invitation in pending
            ],
        }
    family = db.query(Family).filter(Family.id == member.family_id).first()
    return {
        "family": family_payload(db, family, user_id),
        "pending_invitations": [],
    }


def create_family(data: FamilyCreate, db: Session=None, user_id: int=None):
    if active_membership(db, user_id):
        raise ApplicationError(status_code=409, detail="Вы уже состоите в семье")
    user = db.query(User).filter(User.id == user_id).first()
    if db.query(FamilyMember).filter(
        FamilyMember.status == "pending",
        func.lower(FamilyMember.email) == user.email.lower(),
    ).first():
        raise ApplicationError(status_code=409, detail="Сначала примите или отклоните приглашение в семью")
    family = Family(name=data.name.strip(), owner_user_id=user_id)
    db.add(family)
    db.flush()
    db.add(FamilyMember(
        family_id=family.id,
        user_id=user_id,
        email=user.email.lower(),
        role="owner",
        status="active",
        invited_by_user_id=user_id,
        accepted_at=datetime.now(timezone.utc),
    ))
    db.commit()
    db.refresh(family)
    return family_payload(db, family, user_id)


def invite_member(data: InviteCreate, db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    if membership.role != "owner":
        raise ApplicationError(status_code=403, detail="Приглашать участников может владелец")
    email = data.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    existing = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        func.lower(FamilyMember.email) == email,
    ).first()
    if existing:
        raise ApplicationError(status_code=409, detail="Пользователь уже приглашён")
    if user and active_membership(db, user.id):
        raise ApplicationError(status_code=409, detail="Пользователь уже состоит в другой семье")
    member_count = db.query(FamilyMember).filter(FamilyMember.family_id == membership.family_id).count()
    if app_config_svc.is_billing_enabled(db) and member_count >= FAMILY_MAX_MEMBERS:
        raise ApplicationError(
            status_code=400,
            detail=f"В семейном пространстве уже максимум участников ({FAMILY_MAX_MEMBERS})",
        )
    invitation = FamilyMember(
        family_id=membership.family_id,
        user_id=user.id if user else None,
        email=email,
        role=data.role,
        status="pending",
        invited_by_user_id=user_id,
    )
    db.add(invitation)
    family_name = db.query(Family.name).filter(
        Family.id == membership.family_id
    ).scalar()
    invitation_title = "Приглашение в семейное пространство"
    invitation_message = (
        f"Вас пригласили в семейное пространство «{family_name}». "
        "Примите приглашение, чтобы участвовать в общих финансах."
    )
    if user:
        notify_user(
            db, user, event="family_invitation", title=invitation_title,
            message=invitation_message, link="/settings/family",
        )
    db.commit()
    db.refresh(invitation)
    invite_url = f"{app_url()}/settings/family"
    safe_family_name = html.escape(family_name)
    safe_email = html.escape(email)
    safe_invite_url = html.escape(invite_url, quote=True)
    if not user:
        send_email(
            email,
            f"Приглашение в семейные финансы CaseMoney — {family_name}",
            (
                f"Вас пригласили в семейное пространство «{family_name}».\n"
                f"Войдите в CaseMoney под адресом {email} и примите приглашение:\n"
                f"{invite_url}"
            ),
            (
                f"<p>Вас пригласили в семейное пространство "
                f"<strong>«{safe_family_name}»</strong>.</p>"
                f"<p>Войдите в CaseMoney под адресом {safe_email} и "
                f"<a href=\"{safe_invite_url}\">примите приглашение</a>.</p>"
            ),
        )
    return {"id": invitation.id, "email": email, "status": "pending"}


def update_member_role(member_id: int, data: MemberRoleUpdate, db: Session=None, user_id: int=None):
    membership = require_family_owner(db, user_id)
    target = db.query(FamilyMember).filter(
        FamilyMember.id == member_id,
        FamilyMember.family_id == membership.family_id,
    ).first()
    if not target:
        raise ApplicationError(status_code=404, detail="Участник не найден")
    if target.role == "owner":
        raise ApplicationError(status_code=400, detail="Роль владельца нельзя изменить")
    target.role = data.role
    notify_family_members(
        db,
        family_id=membership.family_id,
        actor_user_id=user_id,
        recipient_ids={target.user_id} if target.user_id else set(),
        event="family_access",
        title="Изменена роль в семье",
        message=f"Ваша роль в семейном пространстве изменена на «{data.role}».",
        link="/settings/family",
    )
    db.commit()
    return {"id": target.id, "role": target.role}


def remove_member(member_id: int, db: Session=None, user_id: int=None):
    """Убрать участника из семьи — владельцем (в т.ч. пока приглашение ещё
    не принято) или самим участником (выход из семьи)."""
    membership = require_membership(db, user_id)
    target = db.query(FamilyMember).filter(
        FamilyMember.id == member_id,
        FamilyMember.family_id == membership.family_id,
    ).first()
    if not target:
        raise ApplicationError(status_code=404, detail="Участник не найден")

    is_self = target.user_id == user_id
    if not is_self and membership.role != "owner":
        raise ApplicationError(status_code=403, detail="Удалять участников может только владелец")
    if target.role == "owner":
        raise ApplicationError(status_code=400, detail="Нельзя удалить владельца семьи")

    db.delete(target)
    db.commit()


def accept_invitation(invitation_id: int, db: Session=None, user_id: int=None):
    user = db.query(User).filter(User.id == user_id).first()
    invitation = db.query(FamilyMember).filter(
        FamilyMember.id == invitation_id,
        FamilyMember.status == "pending",
        func.lower(FamilyMember.email) == user.email.lower(),
    ).first()
    if not invitation:
        raise ApplicationError(status_code=404, detail="Приглашение не найдено")
    if active_membership(db, user_id):
        raise ApplicationError(status_code=409, detail="Вы уже состоите в семье")
    invitation.user_id = user_id
    invitation.status = "active"
    invitation.accepted_at = datetime.now(timezone.utc)
    family = db.query(Family).filter(Family.id == invitation.family_id).first()
    actor_name = user.username if user.username else user.email
    notify_family_members(
        db,
        family_id=invitation.family_id,
        actor_user_id=user_id,
        recipient_ids={family.owner_user_id} if family else set(),
        event="family_invitation",
        title="Приглашение принято",
        message=f"{actor_name} присоединился(ась) к семейному пространству.",
        link="/settings/family",
    )
    db.commit()
    return family_payload(db, family, user_id)
