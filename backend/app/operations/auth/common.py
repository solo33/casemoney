"""Auth: common. Callers supply resolved user and database session."""
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.user_currency import UserCurrency
from app.models.family import Family, FamilyMember
from app.models.notification import Notification
from app.services.auth import create_access_token, create_activation_token, create_reset_token, normalize_email
from app.services.auth import credential_version
from app.services.email import send_activation_email, send_registration_notification, send_reset_email, app_url
from app.seeds import seed_default_categories, seed_default_accounts
from datetime import datetime, timedelta, timezone



MAX_CODE_ATTEMPTS = 5


from app.constants import VERIFICATION_GRACE_DAYS


VERIFICATION_RESEND_COOLDOWN_MIN = 15


MAX_VERIFICATION_EMAIL_ATTEMPTS = 5


DEMO_TOKEN_LIFETIME = timedelta(hours=3)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _build_activation_url(user_id: int) -> str:
    token = create_activation_token(user_id)
    return f"{app_url()}/activate?token={token}"


def _send_activation(user: User):
    """Background task: отправить activation email пользователю."""
    try:
        send_activation_email(user.email, user.username, _build_activation_url(user.id))
    except Exception:
        pass


def _notify_registration(email: str, username: str, created_at: datetime) -> None:
    """Background task: notify the owner without affecting registration."""
    try:
        registered_at = _as_utc(created_at).isoformat()
        send_registration_notification(email, username, registered_at)
    except Exception:
        pass


def _create_user(
    db: Session,
    email: str,
    username: str,
    hashed_password: str,
    *,
    email_verified: bool = True,
    preferred_mode: str = "personal",
) -> User:
    """Создаёт пользователя + дефолтные валюту/категории/счета."""
    user = User(
        email=normalize_email(email),
        username=username,
        hashed_password=hashed_password,
        email_verified=email_verified,
        preferred_mode=preferred_mode,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(UserCurrency(user_id=user.id, currency=user.main_currency, auto=True))
    db.commit()

    seed_default_categories(db, user.id)
    seed_default_accounts(db, user.id, currency=user.main_currency)
    return user


def _create_pending_family_invitation_notifications(db: Session, user: User) -> None:
    """Expose invitations made before account registration in the app UI."""
    invitations = db.query(FamilyMember).filter(
        FamilyMember.status == "pending",
        func.lower(FamilyMember.email) == user.email.lower(),
    ).all()
    if not invitations:
        return
    family_names = dict(
        db.query(Family.id, Family.name).filter(
            Family.id.in_([invitation.family_id for invitation in invitations])
        ).all()
    )
    db.add_all([
        Notification(
            user_id=user.id,
            title="Приглашение в семейное пространство",
            message=f"Вас пригласили в семейное пространство «{family_names.get(invitation.family_id, 'CaseMoney Family')}». Примите приглашение, чтобы участвовать в общих финансах.",
            link="/settings/family",
        )
        for invitation in invitations
    ])
    db.commit()


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _verification_time_left(user: User) -> timedelta:
    created_at = _as_utc(user.created_at or _now())
    return created_at + timedelta(days=VERIFICATION_GRACE_DAYS) - _now()


def _create_user_access_token(user: User) -> str:
    expires_delta = None
    if not user.email_verified:
        expires_delta = min(
            _verification_time_left(user),
            timedelta(days=VERIFICATION_GRACE_DAYS),
        )
    return create_access_token({"sub": str(user.id), "cv": credential_version(user.hashed_password)}, expires_delta=expires_delta)


def _record_verification_email_attempt(db: Session, user: User) -> None:
    user.verification_email_attempts = (user.verification_email_attempts or 0) + 1
    user.verification_email_sent_at = _now()
    db.commit()


def _can_resend_verification(user: User) -> bool:
    if (user.verification_email_attempts or 0) >= MAX_VERIFICATION_EMAIL_ATTEMPTS:
        return False
    if not user.verification_email_sent_at:
        return True
    elapsed = _now() - _as_utc(user.verification_email_sent_at)
    return elapsed >= timedelta(minutes=VERIFICATION_RESEND_COOLDOWN_MIN)


def _build_reset_url(user: User) -> str:
    token = create_reset_token(user.id, user.hashed_password)
    return f"{app_url()}/reset-password?token={token}"


def _send_reset(user: User):
    try:
        send_reset_email(user.email, user.username, _build_reset_url(user))
    except Exception:
        pass
