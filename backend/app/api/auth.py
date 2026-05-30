from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.user_currency import UserCurrency
from app.schemas.user import UserRegister, UserLogin, UserResponse, Token
from app.services.auth import (
    hash_password, verify_password, create_access_token,
    create_activation_token, verify_activation_token,
)
from app.services.email import send_activation_email, app_url, is_smtp_configured
from app.services.app_config import is_email_verification_required
from app.seeds import seed_default_categories

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
    user: UserResponse
    email_sent: bool
    smtp_configured: bool


@router.post("/register", response_model=RegisterResponse)
def register(
    data: UserRegister,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    require_verification = is_email_verification_required(db)

    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
        # Если активация отключена админом — сразу считаем email подтверждённым
        email_verified=not require_verification,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Создаём дефолтную user_currency
    db.add(UserCurrency(user_id=user.id, currency=user.main_currency, auto=True))
    db.commit()

    # Дефолтные категории
    seed_default_categories(db, user.id)

    # Письмо отправляем только если активация требуется
    email_sent = False
    if require_verification:
        background.add_task(_send_activation, user)
        email_sent = True

    return RegisterResponse(
        user=user,
        email_sent=email_sent,
        smtp_configured=is_smtp_configured(),
    )


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
