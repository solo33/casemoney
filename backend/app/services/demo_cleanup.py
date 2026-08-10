"""Удаление просроченных эфемерных демо-аккаунтов (User.is_demo=True).

Каждый визит на публичную кнопку «Заполнить демо-вход» создаёт изолированный
аккаунт (см. app/seeds.py:create_ephemeral_demo_user) с коротким токеном.
Данные никому не нужны дольше времени жизни токена — этот воркер подчищает
аккаунты, которым больше DEMO_ACCOUNT_TTL с момента создания.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.user_cleanup import delete_user_completely

# Держим TTL аккаунта чуть больше TTL токена (app/api/auth.py), чтобы не
# удалить песочницу из-под ещё активной сессии на границе интервала.
DEMO_ACCOUNT_TTL = timedelta(hours=4)


def cleanup_expired_demo_users(db: Session) -> int:
    cutoff = datetime.now(timezone.utc) - DEMO_ACCOUNT_TTL
    expired_ids = [
        row[0]
        for row in db.query(User.id).filter(
            User.is_demo.is_(True),
            User.created_at < cutoff,
        ).all()
    ]
    for user_id in expired_ids:
        delete_user_completely(db, user_id)
    db.commit()
    return len(expired_ids)
