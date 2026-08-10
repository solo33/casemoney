"""Admin API.

Доступ только пользователям с is_admin=True.
По принципу — НЕ даём админу прямого доступа к чужим транзакциям/счетам.
Только метаданные юзеров: счётчики, план, активность.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.notification import Notification
from app.models.billing import Subscription
from app.schemas.admin import (
    AdminUserSummary, AdminUsersPage, AdminUserUpdate,
    AdminPasswordReset, AdminStats, AdminConfig, AdminConfigUpdate,
)
from app.schemas.notification import AdminNotificationCreate
from app.services.auth import decode_token, hash_password
from app.services.user_cleanup import delete_user_completely
from app.services import app_config as app_config_svc
from app.services.email import is_smtp_configured

router = APIRouter(prefix="/api/admin", tags=["admin"])
security = HTTPBearer()


def get_admin_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user_id


@router.post("/notifications", status_code=201)
def create_notification(
    data: AdminNotificationCreate,
    db: Session = Depends(get_db),
    _: int = Depends(get_admin_user_id),
):
    query = db.query(User)
    if data.user_id is not None:
        query = query.filter(User.id == data.user_id)
    recipients = query.all()
    if data.user_id is not None and not recipients:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
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
    db.commit()
    return {"recipients_count": len(notifications)}


def _summary(db: Session, u: User) -> AdminUserSummary:
    acc_count = db.query(Account).filter(Account.user_id == u.id).count()
    cat_count = db.query(Category).filter(Category.user_id == u.id).count()
    tx_count = db.query(Transaction).filter(Transaction.user_id == u.id).count()
    return AdminUserSummary(
        id=u.id,
        email=u.email,
        username=u.username,
        is_active=u.is_active,
        is_admin=u.is_admin,
        main_currency=u.main_currency,
        plan=u.plan,
        plan_source=u.plan_source,
        plan_expires_at=u.plan_expires_at,
        family_upgrade_enabled=u.family_upgrade_enabled,
        created_at=u.created_at,
        accounts_count=acc_count,
        categories_count=cat_count,
        transactions_count=tx_count,
    )


@router.get("/users", response_model=AdminUsersPage)
def list_users(
    q: Optional[str] = Query(None, description="Поиск по email или username"),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: int = Depends(get_admin_user_id),
):
    query = db.query(User)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(or_(
            func.lower(User.email).like(like),
            func.lower(User.username).like(like),
        ))
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    total = query.count()
    users = query.order_by(User.created_at.desc().nullslast(), User.id.desc()).offset(offset).limit(limit).all()
    return AdminUsersPage(
        items=[_summary(db, u) for u in users],
        total=total, limit=limit, offset=offset,
    )


@router.get("/users/{user_id}", response_model=AdminUserSummary)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: int = Depends(get_admin_user_id),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return _summary(db, u)


@router.patch("/users/{user_id}", response_model=AdminUserSummary)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_admin_user_id),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    update = data.model_dump(exclude_unset=True)

    # Защита: нельзя снять admin с самого себя если он последний админ
    if u.id == admin_id and "is_admin" in update and update["is_admin"] is False:
        admins_left = db.query(User).filter(User.is_admin == True, User.id != admin_id).count()
        if admins_left == 0:
            raise HTTPException(status_code=400, detail="Нельзя снять admin с последнего администратора")

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
    db.commit()
    db.refresh(u)
    return _summary(db, u)


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_password(
    user_id: int,
    data: AdminPasswordReset,
    db: Session = Depends(get_db),
    _: int = Depends(get_admin_user_id),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if len(data.new_password) < 4:
        raise HTTPException(status_code=400, detail="Пароль слишком короткий (мин. 4)")
    u.hashed_password = hash_password(data.new_password)
    db.commit()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_admin_user_id),
):
    if user_id == admin_id:
        raise HTTPException(status_code=400, detail="Удалить себя нельзя — используйте обычные настройки")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    delete_user_completely(db, user_id)
    db.commit()


def _config_out(cfg) -> AdminConfig:
    return AdminConfig(
        require_email_verification=cfg.require_email_verification,
        smtp_configured=is_smtp_configured(),
        registration_enabled=cfg.registration_enabled,
    )


@router.get("/config", response_model=AdminConfig)
def get_app_config(
    db: Session = Depends(get_db),
    _: int = Depends(get_admin_user_id),
):
    return _config_out(app_config_svc.get_config(db))


@router.patch("/config", response_model=AdminConfig)
def update_app_config(
    data: AdminConfigUpdate,
    db: Session = Depends(get_db),
    _: int = Depends(get_admin_user_id),
):
    cfg = app_config_svc.get_config(db)
    update = data.model_dump(exclude_unset=True)

    for k, v in update.items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    app_config_svc.invalidate_cache()
    return _config_out(cfg)


@router.get("/stats", response_model=AdminStats)
def get_stats(
    db: Session = Depends(get_db),
    _: int = Depends(get_admin_user_id),
):
    now = datetime.now(timezone.utc)
    last_7d = now - timedelta(days=7)
    last_30d = now - timedelta(days=30)

    total = db.query(User).count()
    active = db.query(User).filter(User.is_active == True).count()
    admins = db.query(User).filter(User.is_admin == True).count()

    accs = db.query(Account).count()
    cats = db.query(Category).count()
    txs = db.query(Transaction).count()

    new_7d = db.query(User).filter(User.created_at >= last_7d).count()
    new_30d = db.query(User).filter(User.created_at >= last_30d).count()

    # Регистрации по дням за последние 30 дней
    by_day = (
        db.query(
            func.date(User.created_at).label("day"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= last_30d)
        .group_by("day")
        .order_by("day")
        .all()
    )
    new_signups_by_day = [
        {"date": row.day.isoformat() if row.day else "", "count": row.count}
        for row in by_day
    ]

    return AdminStats(
        total_users=total,
        active_users=active,
        admin_users=admins,
        total_accounts=accs,
        total_categories=cats,
        total_transactions=txs,
        new_users_last_7d=new_7d,
        new_users_last_30d=new_30d,
        new_signups_by_day=new_signups_by_day,
    )
