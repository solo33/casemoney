"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.dependencies import current_user_id as get_current_user_id
from app.database import get_db
from app.schemas.notification import NotificationSettingsResponse, NotificationSettingsUpdate, NotificationsPage
from app.schemas.push_subscription import PushConfigResponse, PushSubscriptionCreate, PushSubscriptionDelete
from app.operations.notifications import queries, commands


router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@router.get("/push/config", response_model=PushConfigResponse)
def get_push_config(
    _: int = Depends(get_current_user_id),
):
    return queries.get_push_config(_=_)


@router.post("/push/subscribe", status_code=201)
def subscribe_push(
    data: PushSubscriptionCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.subscribe_push(data=data, db=db, user_id=user_id)


@router.delete("/push/subscribe", status_code=204)
def unsubscribe_push(
    data: PushSubscriptionDelete,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.unsubscribe_push(data=data, db=db, user_id=user_id)


@router.get("/settings", response_model=NotificationSettingsResponse)
def get_notification_settings(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return queries.get_notification_settings(db=db, user_id=user_id)


@router.put("/settings", response_model=NotificationSettingsResponse)
def update_notification_settings(
    data: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.update_notification_settings(data=data, db=db, user_id=user_id)


@router.get("/", response_model=NotificationsPage)
def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return queries.list_notifications(limit=limit, db=db, user_id=user_id)


@router.patch("/{notification_id}/read", status_code=204)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.mark_notification_read(notification_id=notification_id, db=db, user_id=user_id)


@router.post("/read-all", status_code=204)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.mark_all_notifications_read(db=db, user_id=user_id)
