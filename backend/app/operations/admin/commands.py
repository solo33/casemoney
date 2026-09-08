"""Admin: commands. Callers supply resolved user and database session."""
from app.application import TaskScheduler, ApplicationError
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.notification import Notification
from app.models.billing import Subscription
from app.schemas.admin import AdminUserUpdate, AdminPasswordReset, AdminConfigUpdate
from app.schemas.notification import AdminNotificationCreate
from app.services.auth import hash_password
from app.services.user_cleanup import delete_user_completely
from app.services import app_config as app_config_svc
from app.services.email import send_email
from app.services.notifications import is_enabled
from app.services.web_push import send_web_pushes
from app.operations.admin.common import _config_out, _summary


def create_notification(data: AdminNotificationCreate, db: Session=None, _: int=None):
    query = db.query(User)
    if data.user_id is not None:
        query = query.filter(User.id == data.user_id)
    recipients = query.all()
    if data.user_id is not None and not recipients:
        raise ApplicationError(status_code=404, detail="Пользователь не найден")
    notifications = [
        Notification(
            user_id=user.id,
            title=data.title.strip(),
            message=data.message.strip(),
            link=data.link,
        )
        for user in recipients
    ]
    db.add_all(notifications)
    for user in recipients:
        if is_enabled(user, "subscription", "push"):
            send_web_pushes(db, user, title=data.title.strip(), link=data.link)
    db.commit()
    return {"recipients_count": len(notifications)}


def update_user(user_id: int, data: AdminUserUpdate, background: TaskScheduler, db: Session=None, admin_id: int=None):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise ApplicationError(status_code=404, detail="User not found")

    update = data.model_dump(exclude_unset=True)

    # Защита: нельзя снять admin с самого себя если он последний админ
    if u.id == admin_id and "is_admin" in update and update["is_admin"] is False:
        admins_left = db.query(User).filter(User.is_admin == True, User.id != admin_id).count()
        if admins_left == 0:
            raise ApplicationError(status_code=400, detail="Нельзя снять admin с последнего администратора")

    family_activated = update.get("plan") == "family" and u.plan != "family"
    if "plan" in update:
        u.plan_source = "admin"
        u.plan_expires_at = None
        subscription = db.query(Subscription).filter(Subscription.user_id == u.id).first()
        if subscription:
            # Администраторская выдача тарифа не должна приводить к скрытому
            # следующему списанию по ранее оплаченной подписке.
            subscription.cancel_at_period_end = True
    for k, v in update.items():
        setattr(u, k, v)
    if family_activated:
        db.add(Notification(
            user_id=u.id,
            title="Тариф Family активирован",
            message="Для вашего аккаунта подключён Family. Теперь доступны семейное пространство, обязательства, депозиты и расширенные возможности.",
            link="/billing",
        ))
    db.commit()
    db.refresh(u)
    if family_activated:
        background.add_task(
            send_email,
            u.email,
            "CaseMoney — тариф Family активирован",
            "Для вашего аккаунта подключён тариф Family. Войдите в CaseMoney, чтобы настроить семейное пространство, обязательства и депозиты.",
            "<p>Для вашего аккаунта подключён тариф <strong>Family</strong>.</p><p>Войдите в CaseMoney, чтобы настроить семейное пространство, обязательства и депозиты.</p>",
        )
    return _summary(db, u)


def reset_password(user_id: int, data: AdminPasswordReset, db: Session=None, _: int=None):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise ApplicationError(status_code=404, detail="User not found")
    if len(data.new_password) < 4:
        raise ApplicationError(status_code=400, detail="Пароль слишком короткий (мин. 4)")
    u.hashed_password = hash_password(data.new_password)
    db.commit()


def delete_user(user_id: int, db: Session=None, admin_id: int=None):
    if user_id == admin_id:
        raise ApplicationError(status_code=400, detail="Удалить себя нельзя — используйте обычные настройки")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise ApplicationError(status_code=404, detail="User not found")
    delete_user_completely(db, user_id)
    db.commit()


def update_app_config(data: AdminConfigUpdate, db: Session=None, _: int=None):
    cfg = app_config_svc.get_config(db)
    update = data.model_dump(exclude_unset=True)

    for k, v in update.items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    app_config_svc.invalidate_cache()
    return _config_out(cfg)
