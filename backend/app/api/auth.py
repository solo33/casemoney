import secrets
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.user_currency import UserCurrency
from app.models.pending_registration import PendingRegistration
from app.schemas.user import UserRegister, UserLogin, UserResponse, Token
from app.services.auth import (
    hash_password, verify_password, create_access_token,
    create_activation_token, verify_activation_token,
    create_reset_token, verify_reset_token,
)
from app.services.email import (
    send_activation_email, send_reset_email, send_code_email, app_url, is_smtp_configured,
)
from app.services.app_config import is_email_verification_required, get_config
from app.seeds import seed_default_categories, seed_default_accounts
from datetime import datetime, timedelta, timezone

# Параметры кода подтверждения
CODE_TTL_MIN = 15          # срок жизни кода
RESEND_COOLDOWN_SEC = 60   # минимум между отправками кода на один email
MAX_CODE_ATTEMPTS = 5      # попыток ввода кода


def _gen_code() -> str:
    return f"{secrets.randbelow(900000) + 100000}"  # 6 цифр, 100000..999999


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


class RegisterResponse(BaseModel):
    requires_code: bool        # нужно ли вводить код подтверждения
    smtp_configured: bool


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


def _create_user(db: Session, email: str, username: str, hashed_password: str, cfg) -> User:
    """Создаёт пользователя + дефолтные валюту/категории/счета + стартовый тариф."""
    user = User(
        email=email,
        username=username,
        hashed_password=hashed_password,
        email_verified=True,
    )
    if cfg.default_plan == "premium":
        user.is_premium = True
        days = cfg.default_premium_days or 0
        user.premium_until = None if days <= 0 else _now() + timedelta(days=days)

    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(UserCurrency(user_id=user.id, currency=user.main_currency, auto=True))
    db.commit()

    seed_default_categories(db, user.id)
    seed_default_accounts(db, user.id, currency=user.main_currency)
    return user


@router.post("/register", response_model=RegisterResponse)
def register(
    data: UserRegister,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    cfg = get_config(db)
    if not cfg.registration_enabled:
        raise HTTPException(status_code=403, detail="Регистрация временно закрыта")

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    hashed = hash_password(data.password)

    # Если админ отключил подтверждение email — создаём сразу, без кода.
    if not cfg.require_email_verification:
        _create_user(db, data.email, data.username, hashed, cfg)
        return RegisterResponse(requires_code=False, smtp_configured=is_smtp_configured())

    # Иначе — заявка на регистрацию + код на email.
    pending = db.query(PendingRegistration).filter(
        PendingRegistration.email == data.email
    ).first()

    now = _now()
    if pending and pending.last_sent_at:
        last = pending.last_sent_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() < RESEND_COOLDOWN_SEC:
            wait = int(RESEND_COOLDOWN_SEC - (now - last).total_seconds())
            raise HTTPException(status_code=429, detail=f"Код уже отправлен. Повторите через {wait} с.")

    code = _gen_code()
    if pending is None:
        pending = PendingRegistration(email=data.email)
        db.add(pending)
    pending.username = data.username
    pending.hashed_password = hashed
    pending.code = code
    pending.expires_at = now + timedelta(minutes=CODE_TTL_MIN)
    pending.attempts = 0
    pending.last_sent_at = now
    db.commit()

    def _send():
        try:
            send_code_email(data.email, data.username, code)
        except Exception:
            pass
    background.add_task(_send)

    return RegisterResponse(requires_code=True, smtp_configured=is_smtp_configured())


@router.post("/verify-code", response_model=Token)
def verify_code(data: VerifyCodeRequest, db: Session = Depends(get_db)):
    """Проверяет код и создаёт пользователя. Возвращает токен (автологин)."""
    pending = db.query(PendingRegistration).filter(
        PendingRegistration.email == data.email
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
    if db.query(User).filter(User.email == pending.email).first():
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    cfg = get_config(db)
    user = _create_user(db, pending.email, pending.username, pending.hashed_password, cfg)
    db.delete(pending)
    db.commit()

    token = create_access_token({"sub": str(user.id)})
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
def forgot_password(
    data: ForgotPasswordRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Запрос сброса пароля. Всегда отвечаем ok=True (не раскрываем, есть ли
    такой email), но письмо шлём только если пользователь реально существует."""
    user = db.query(User).filter(User.email == data.email).first()
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
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    token = create_access_token({"sub": str(user.id)})
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
def resend_activation(
    data: ResendRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Повторно отправить письмо активации. Не раскрываем существует ли email."""
    user = db.query(User).filter(User.email == data.email).first()
    if user and not user.email_verified:
        background.add_task(_send_activation, user)
    return ResendResponse(
        ok=True,
        message="Если такой email зарегистрирован и не подтверждён — письмо отправлено.",
    )
