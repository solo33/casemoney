"""Admin: queries. Callers supply resolved user and database session."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.admin import AdminUsersPage, AdminStats
from app.services import app_config as app_config_svc
from app.operations.admin.common import _config_out, _summary


def list_users(q: Optional[str]=None, is_active: Optional[bool]=None, limit: int=50, offset: int=0, db: Session=None, _: int=None):
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


def get_user(user_id: int, db: Session=None, _: int=None):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return _summary(db, u)


def get_app_config(db: Session=None, _: int=None):
    return _config_out(app_config_svc.get_config(db))


def get_stats(db: Session=None, _: int=None):
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
