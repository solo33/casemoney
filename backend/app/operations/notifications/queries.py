"""Notifications: queries. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.schemas.notification import NotificationsPage
from app.models.user import User
from app.services.notifications import NOTIFICATION_EVENTS, normalized_preferences
from app.services.web_push import is_web_push_configured, vapid_public_key



def get_push_config(_: int=None):
    public_key = vapid_public_key()
    return {"enabled": is_web_push_configured(), "public_key": public_key}


def get_notification_settings(db: Session=None, user_id: int=None):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ApplicationError(status_code=404, detail="Пользователь не найден")
    return {
        "events": {
            key: {"label": value["label"], "description": value["description"]}
            for key, value in NOTIFICATION_EVENTS.items()
        },
        "preferences": normalized_preferences(user.notification_preferences),
    }


def list_notifications(limit: int=50, db: Session=None, user_id: int=None):
    base = db.query(Notification).filter(Notification.user_id == user_id)
    items = base.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    unread_count = base.filter(Notification.read_at.is_(None)).count()
    return NotificationsPage(items=items, unread_count=unread_count)
