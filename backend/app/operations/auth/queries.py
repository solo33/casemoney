"""Auth: queries. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.user import User
from app.services.auth import verify_activation_token
from app.services.app_config import get_config
from app.schemas.auth_views import ActivationResult, PublicConfig


def public_config(db: Session=None):
    """Публичные флаги для неавторизованных страниц (логин/регистрация)."""
    cfg = get_config(db)
    return PublicConfig(registration_enabled=cfg.registration_enabled)


def activate_get(token: str=..., db: Session=None):
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
