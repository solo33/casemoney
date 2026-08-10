from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

from app.database import get_db
from app.models.user import User
from app.models.user_currency import UserCurrency
from app.models.pending_registration import PendingRegistration
from app.schemas.user import UserRegister, UserLogin, Token
from app.services.auth import (
    hash_password, verify_password, create_access_token,
    create_activation_token, verify_activation_token,
    create_reset_token, verify_reset_token,
    normalize_email,
)
from app.services.email import (
    send_activation_email, send_registration_notification,
    send_reset_email, app_url, is_smtp_configured,
)
from app.services.app_config import get_config
from app.seeds import seed_default_categories, seed_default_accounts, create_ephemeral_demo_user
from datetime import datetime, timedelta, timezone

# Параметры кода подтверждения
MAX_CODE_ATTEMPTS = 5      # попыток ввода кода


VERIFICATION_GRACE_DAYS = 7
VERIFICATION_RESEND_COOLDOWN_MIN = 15
MAX_VERIFICATION_EMAIL_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_activation_url(user_id: int) -> str:
    token = create_activation_token(user_id)
    return f"{app_url()}/activate?token={token}"


def _send_activation(user: User):
    """Background task: отправить activation email пользователю."""
    try:
        send_activation_email(user.email, user.username, _build_activation_url(user.id))
    except Exception:
        pass  # ошибка отправки не должна валить запрос


def _notify_registration(email: str, username: str, created_at: datetime) -> None:
    """Background task: notify the owner without affecting registration."""
    try:
        registered_at = _as_utc(created_at).isoformat()
        send_registration_notification(email, username, registered_at)
    except Exception:
        pass


class RegisterResponse(BaseModel):
    requires_code: bool        # нужно ли вводить код подтверждения
    smtp_configured: bool
    access_token: str | None = None
    token_type: str = "bearer"
    email_sent: bool = False
    verification_grace_days: int = VERIFICATION_GRACE_DAYS


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str


class PublicConfig(BaseModel):
    registration_enabled: bool


@router.get("/config", response_model=PublicConfig)
def public_config(db: Session = Depends(get_db)):
    """Публичные флаги для неавторизованных страниц (логин/регистрация)."""
    cfg = get_config(db)
    return PublicConfig(registration_enabled=cfg.registration_enabled)


def _create_user(
    db: Session,
    email: str,
    username: str,
    hashed_password: str,
    *,
    email_verified: bool = True,
) -> User:
    """Создаёт пользователя + дефолтные валюту/категории/счета."""
    user = User(
        email=normalize_email(email),
        username=username,
        hashed_password=hashed_password,
        email_verified=email_verified,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(UserCurrency(user_id=user.id, currency=user.main_currency, auto=True))
    db.commit()

    seed_default_categories(db, user.id)
    seed_default_accounts(db, user.id, currency=user.main_currency)
    return user


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
    return create_access_token({"sub": str(user.id)}, expires_delta=expires_delta)


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


@router.post("/register", response_model=RegisterResponse)
@limiter.limit("5/hour;10/day")
def register(
    request: Request,
    data: UserRegister,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    cfg = get_config(db)
    if not cfg.registration_enabled:
        raise HTTPException(status_code=403, detail="Регистрация временно закрыта")

    email = normalize_email(str(data.email))
    if db.query(User).filter(func.lower(func.trim(User.email)) == email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

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
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
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


@router.post("/verify-code", response_model=Token)
@limiter.limit("20/hour")
def verify_code(
    request: Request,
    data: VerifyCodeRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Проверяет код и создаёт пользователя. Возвращает токен (автологин)."""
    email = normalize_email(str(data.email))
    pending = db.query(PendingRegistration).filter(
        func.lower(func.trim(PendingRegistration.email)) == email
    ).first()
    if not pending:
        raise HTTPException(status_code=400, detail="Заявка не найдена. Запросите код заново.")

    exp = pending.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if _now() > exp:
        raise HTTPException(status_code=400, detail="Код истёк. Запросите новый.")

    if pending.attempts >= MAX_CODE_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Слишком много попыток. Запросите новый код.")

    if data.code.strip() != pending.code:
        pending.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Неверный код")

    # На случай гонки — проверим, что email ещё не занят
    if db.query(User).filter(
        func.lower(func.trim(User.email)) == normalize_email(pending.email)
    ).first():
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    try:
        user = _create_user(db, pending.email, pending.username, pending.hashed_password)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    ok: bool
    smtp_configured: bool


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def _build_reset_url(user_id: int) -> str:
    token = create_reset_token(user_id)
    return f"{app_url()}/reset-password?token={token}"


def _send_reset(user: User):
    try:
        send_reset_email(user.email, user.username, _build_reset_url(user.id))
    except Exception:
        pass


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/hour")
def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Запрос сброса пароля. Всегда отвечаем ok=True (не раскрываем, есть ли
    такой email), но письмо шлём только если пользователь реально существует."""
    email = normalize_email(str(data.email))
    user = db.query(User).filter(func.lower(func.trim(User.email)) == email).first()
    if user and user.is_active:
        background.add_task(_send_reset, user)
    return ForgotPasswordResponse(ok=True, smtp_configured=is_smtp_configured())


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = verify_reset_token(data.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла")
    if len(data.new_password) < 4:
        raise HTTPException(status_code=400, detail="Пароль слишком короткий (мин. 4 символа)")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"ok": True}


@router.post("/login", response_model=Token)
@limiter.limit("20/minute;200/hour")
def login(request: Request, data: UserLogin, db: Session = Depends(get_db)):
    email = normalize_email(str(data.email))
    user = db.query(User).filter(func.lower(func.trim(User.email)) == email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    cfg = get_config(db)
    if cfg.require_email_verification and not user.email_verified:
        if _verification_time_left(user) <= timedelta(0):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Email не подтверждён. Семидневный период истёк — "
                    "запросите новое письмо и подтвердите адрес."
                ),
            )

    token = _create_user_access_token(user)
    return {"access_token": token, "token_type": "bearer"}


# Токен эфемерного демо чуть короче TTL самого аккаунта в demo_cleanup.py —
# так фоновый воркер никогда не удалит песочницу из-под ещё живой сессии.
DEMO_TOKEN_LIFETIME = timedelta(hours=3)


@router.post("/demo", response_model=Token)
@limiter.limit("20/hour")
def demo_login(request: Request, db: Session = Depends(get_db)):
    """Публичная кнопка «Заполнить демо-вход»: создаёт изолированный
    одноразовый аккаунт с каноничным набором демо-данных и сразу логинит в
    него. Отдельно от статического test@test.com (см. app/seeds.py) —
    каждый посетитель получает свою песочницу, не видит чужих правок."""
    user = create_ephemeral_demo_user(db)
    token = create_access_token({"sub": str(user.id)}, expires_delta=DEMO_TOKEN_LIFETIME)
    return {"access_token": token, "token_type": "bearer"}


class ActivationResult(BaseModel):
    ok: bool
    message: str
    already_verified: bool = False


@router.get("/activate", response_model=ActivationResult)
def activate_get(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Активация email по токену из письма (GET — чтобы по клику работало)."""
    user_id = verify_activation_token(token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.email_verified:
        return ActivationResult(ok=True, message="Email уже подтверждён", already_verified=True)
    user.email_verified = True
    db.commit()
    return ActivationResult(ok=True, message="Email подтверждён, аккаунт активирован")


class ResendRequest(BaseModel):
    email: EmailStr


class ResendResponse(BaseModel):
    ok: bool
    message: str


@router.post("/resend-activation", response_model=ResendResponse)
@limiter.limit("3/hour;10/day")
def resend_activation(
    request: Request,
    data: ResendRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
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
