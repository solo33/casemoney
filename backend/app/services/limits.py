"""Лимиты бесплатного тарифа.

Free:
- 3 счёта
- 10 категорий (= дефолтный набор после регистрации)
- 1 валюта (=основная)

Premium: лимиты не применяются.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.category import Category
from app.models.user import User
from app.models.user_currency import UserCurrency

FREE_LIMITS = {
    "accounts": 3,
    "categories": 10,
    "user_currencies": 1,
}


def is_user_premium(user: User) -> bool:
    """User имеет premium если is_premium=True и срок не истёк (или бессрочный)."""
    if not user or not user.is_premium:
        return False
    if user.premium_until is None:
        return True
    now = datetime.now(timezone.utc)
    until = user.premium_until
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    return until > now


def get_limits_status(db: Session, user_id: int) -> dict:
    """Возвращает текущее использование + лимиты + статус premium."""
    user = db.query(User).filter(User.id == user_id).first()
    premium = is_user_premium(user) if user else False
    usage = {
        "accounts": db.query(Account).filter(Account.user_id == user_id).count(),
        "categories": db.query(Category).filter(Category.user_id == user_id).count(),
        "user_currencies": db.query(UserCurrency).filter(UserCurrency.user_id == user_id).count(),
    }
    return {
        "premium": premium,
        "premium_until": user.premium_until.isoformat() if user and user.premium_until else None,
        "limits": None if premium else FREE_LIMITS,
        "usage": usage,
    }


def enforce_limit(db: Session, user_id: int, kind: str) -> None:
    """Бросает 402 Payment Required если бесплатный лимит исчерпан."""
    user = db.query(User).filter(User.id == user_id).first()
    if is_user_premium(user):
        return
    limit = FREE_LIMITS.get(kind)
    if limit is None:
        return
    model = {
        "accounts": Account,
        "categories": Category,
        "user_currencies": UserCurrency,
    }[kind]
    current = db.query(model).filter(model.user_id == user_id).count()
    if current >= limit:
        kind_ru = {
            "accounts": "счетов",
            "categories": "категорий",
            "user_currencies": "валют",
        }[kind]
        raise HTTPException(
            status_code=402,
            detail=f"Достигнут лимит бесплатной версии: {limit} {kind_ru}. Активируйте Premium для снятия ограничений.",
        )
