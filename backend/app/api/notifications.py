from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.me import get_current_user_id
from app.database import get_db
from app.models.notification import Notification
from app.schemas.notification import (
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    NotificationsPage,
)
from app.models.user import User
from app.services.notifications import NOTIFICATION_EVENTS, normalized_preferences


router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/settings", response_model=NotificationSettingsResponse)
def get_notification_settings(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {
        "events": {
            key: {"label": value["label"], "description": value["description"]}
            for key, value in NOTIFICATION_EVENTS.items()
        },
        "preferences": normalized_preferences(user.notification_preferences),
    }


@router.put("/settings", response_model=NotificationSettingsResponse)
def update_notification_settings(
    data: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


@router.get("/", response_model=NotificationsPage)
def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    base = db.query(Notification).filter(Notification.user_id == user_id)
    items = base.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    unread_count = base.filter(Notification.read_at.is_(None)).count()
    return NotificationsPage(items=items, unread_count=unread_count)


@router.patch("/{notification_id}/read", status_code=204)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user_id,
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()


@router.post("/read-all", status_code=204)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
