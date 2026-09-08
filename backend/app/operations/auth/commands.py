"""Auth: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError, TaskScheduler, RequestContext
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.pending_registration import PendingRegistration
from app.schemas.user import UserRegister, UserLogin
from app.services.auth import hash_password, verify_password, create_access_token, verify_reset_token, normalize_email
from app.services.auth import credential_version
from app.services.email import send_activation_email, is_smtp_configured
from app.services.app_config import get_config
from app.seeds import create_ephemeral_demo_user
from datetime import timedelta, timezone
from app.operations.auth.common import _build_activation_url, _can_resend_verification, _create_pending_family_invitation_notifications, _create_user, _create_user_access_token, _notify_registration, _now, _record_verification_email_attempt, _send_activation, _send_reset, _verification_time_left, DEMO_TOKEN_LIFETIME, MAX_CODE_ATTEMPTS
from app.schemas.auth_views import ForgotPasswordRequest, ForgotPasswordResponse, RegisterResponse, ResendRequest, ResendResponse, ResetPasswordRequest, VerifyCodeRequest


def register(request: RequestContext, data: UserRegister, background: TaskScheduler, db: Session=None):
    cfg = get_config(db)
    if not cfg.registration_enabled:
        raise ApplicationError(status_code=403, detail="Регистрация временно закрыта")

    email = normalize_email(str(data.email))
    if db.query(User).filter(func.lower(func.trim(User.email)) == email).first():
        raise ApplicationError(status_code=400, detail="Email уже зарегистрирован")

    hashed = hash_password(data.password)

    # Create the account immediately. When verification is required, access is
    # granted only for the seven-day grace period and the email can be verified
    # at any point using the activation link.
    try:
        user = _create_user(
            db,
            email,
            data.username,
            hashed,
            email_verified=not cfg.require_email_verification,
            preferred_mode=data.preferred_mode,
        )
    except IntegrityError:
        db.rollback()
        raise ApplicationError(status_code=400, detail="Email уже зарегистрирован")
    _create_pending_family_invitation_notifications(db, user)
    background.add_task(
        _notify_registration,
        user.email,
        user.username,
        user.created_at or _now(),
    )
    email_sent = False
    if cfg.require_email_verification:
        _record_verification_email_attempt(db, user)
        email_sent = send_activation_email(
            user.email,
            user.username,
            _build_activation_url(user.id),
        )
    token = _create_user_access_token(user)
    return RegisterResponse(
        requires_code=False,
        smtp_configured=is_smtp_configured(),
        access_token=token,
        email_sent=email_sent,
    )


def verify_code(request: RequestContext, data: VerifyCodeRequest, background: TaskScheduler, db: Session=None):
    """Проверяет код и создаёт пользователя. Возвращает токен (автологин)."""
    email = normalize_email(str(data.email))
    pending = db.query(PendingRegistration).filter(
        func.lower(func.trim(PendingRegistration.email)) == email
    ).first()
    if not pending:
        raise ApplicationError(status_code=400, detail="Заявка не найдена. Запросите код заново.")

    exp = pending.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if _now() > exp:
        raise ApplicationError(status_code=400, detail="Код истёк. Запросите новый.")

    if pending.attempts >= MAX_CODE_ATTEMPTS:
        raise ApplicationError(status_code=429, detail="Слишком много попыток. Запросите новый код.")

    if data.code.strip() != pending.code:
        pending.attempts += 1
        db.commit()
        raise ApplicationError(status_code=400, detail="Неверный код")

    # На случай гонки — проверим, что email ещё не занят
    if db.query(User).filter(
        func.lower(func.trim(User.email)) == normalize_email(pending.email)
    ).first():
        db.delete(pending)
        db.commit()
        raise ApplicationError(status_code=400, detail="Email уже зарегистрирован")

    try:
        user = _create_user(db, pending.email, pending.username, pending.hashed_password)
    except IntegrityError:
        db.rollback()
        raise ApplicationError(status_code=400, detail="Email уже зарегистрирован")
    background.add_task(
        _notify_registration,
        user.email,
        user.username,
        user.created_at or _now(),
    )
    db.delete(pending)
    db.commit()

    token = _create_user_access_token(user)
    return {"access_token": token, "token_type": "bearer"}


def forgot_password(request: RequestContext, data: ForgotPasswordRequest, background: TaskScheduler, db: Session=None):
    """Запрос сброса пароля. Всегда отвечаем ok=True (не раскрываем, есть ли
    такой email), но письмо шлём только если пользователь реально существует."""
    email = normalize_email(str(data.email))
    user = db.query(User).filter(func.lower(func.trim(User.email)) == email).first()
    if user and user.is_active:
        background.add_task(_send_reset, user)
    return ForgotPasswordResponse(ok=True, smtp_configured=is_smtp_configured())


def reset_password(data: ResetPasswordRequest, db: Session=None):
    user_id = verify_reset_token(data.token)
    if not user_id:
        raise ApplicationError(status_code=400, detail="Ссылка недействительна или истекла")
    if len(data.new_password) < 4:
        raise ApplicationError(status_code=400, detail="Пароль слишком короткий (мин. 4 символа)")
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise ApplicationError(status_code=404, detail="Пользователь не найден")
    if not user.is_active or not verify_reset_token(data.token, user.hashed_password):
        raise ApplicationError(status_code=400, detail="Ссылка недействительна или уже использована")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"ok": True}


def login(request: RequestContext, data: UserLogin, db: Session=None):
    email = normalize_email(str(data.email))
    user = db.query(User).filter(func.lower(func.trim(User.email)) == email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise ApplicationError(status_code=401, detail="Неверный email или пароль")
    if not user.is_active:
        raise ApplicationError(status_code=403, detail="Аккаунт заблокирован")

    cfg = get_config(db)
    if cfg.require_email_verification and not user.email_verified:
        if _verification_time_left(user) <= timedelta(0):
            raise ApplicationError(
                status_code=403,
                detail=(
                    "Email не подтверждён. Семидневный период истёк — "
                    "запросите новое письмо и подтвердите адрес."
                ),
            )

    token = _create_user_access_token(user)
    return {"access_token": token, "token_type": "bearer"}


def demo_login(request: RequestContext, db: Session=None):
    """Публичная кнопка «Заполнить демо-вход»: создаёт изолированный
    одноразовый аккаунт с каноничным набором демо-данных и сразу логинит в
    него. Отдельно от статического test@test.com (см. app/seeds.py) —
    каждый посетитель получает свою песочницу, не видит чужих правок."""
    user = create_ephemeral_demo_user(db)
    token = create_access_token({"sub": str(user.id), "cv": credential_version(user.hashed_password)}, expires_delta=DEMO_TOKEN_LIFETIME)
    return {"access_token": token, "token_type": "bearer"}


def resend_activation(request: RequestContext, data: ResendRequest, background: TaskScheduler, db: Session=None):
    """Повторно отправить письмо активации. Не раскрываем существует ли email."""
    email = normalize_email(str(data.email))
    user = db.query(User).filter(func.lower(func.trim(User.email)) == email).first()
    if user and not user.email_verified and _can_resend_verification(user):
        _record_verification_email_attempt(db, user)
        background.add_task(_send_activation, user)
    return ResendResponse(
        ok=True,
        message="Если такой email зарегистрирован и не подтверждён — письмо отправлено.",
    )
