"""Notifications: commands. Callers supply resolved user and database session."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.schemas.notification import NotificationSettingsUpdate
from app.models.user import User
from app.models.push_subscription import PushSubscription
from app.services.notifications import NOTIFICATION_EVENTS, normalized_preferences
from app.schemas.push_subscription import PushSubscriptionCreate, PushSubscriptionDelete



def subscribe_push(data: PushSubscriptionCreate, db: Session=None, user_id: int=None):
    subscription = db.query(PushSubscription).filter(PushSubscription.endpoint == data.endpoint).first()
    if subscription is None:
        subscription = PushSubscription(user_id=user_id, **data.model_dump())
        db.add(subscription)
    else:
        subscription.user_id = user_id
        subscription.p256dh = data.p256dh
        subscription.auth = data.auth
        subscription.user_agent = data.user_agent
    db.commit()
    return {"subscribed": True}


def unsubscribe_push(data: PushSubscriptionDelete, db: Session=None, user_id: int=None):
    db.query(PushSubscription).filter(
        PushSubscription.user_id == user_id,
        PushSubscription.endpoint == data.endpoint,
    ).delete(synchronize_session=False)
    db.commit()


def update_notification_settings(data: NotificationSettingsUpdate, db: Session=None, user_id: int=None):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    known = {key: value.model_dump() for key, value in data.preferences.items() if key in NOTIFICATION_EVENTS}
    # Always persist a full, normalized map — the UI can safely render new
    # events after a deployment without requiring a separate migration.
    user.notification_preferences = normalized_preferences(known)
    db.commit()
    return {
        "events": {
            key: {"label": value["label"], "description": value["description"]}
            for key, value in NOTIFICATION_EVENTS.items()
        },
        "preferences": user.notification_preferences,
    }


def mark_notification_read(notification_id: int, db: Session=None, user_id: int=None):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user_id,
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()


def mark_all_notifications_read(db: Session=None, user_id: int=None):
    db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
