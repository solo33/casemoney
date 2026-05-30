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
from app.models.account_balance import AccountBalance
from app.models.account_group import AccountGroup
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user_currency import UserCurrency
from app.schemas.admin import (
    AdminUserSummary, AdminUsersPage, AdminUserUpdate,
    AdminPasswordReset, AdminStats,
)
from app.services.auth import decode_token, hash_password

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
        is_premium=u.is_premium,
        premium_until=u.premium_until,
        main_currency=u.main_currency,
        created_at=u.created_at,
        accounts_count=acc_count,
        categories_count=cat_count,
        transactions_count=tx_count,
    )


@router.get("/users", response_model=AdminUsersPage)
def list_users(
    q: Optional[str] = Query(None, description="Поиск по email или username"),
    is_premium: Optional[bool] = Query(None),
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
    if is_premium is not None:
        query = query.filter(User.is_premium == is_premium)
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
    # Cascade delete всех данных
    acc_ids = [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()]
    db.query(Transaction).filter(Transaction.user_id == user_id).delete(synchronize_session=False)
    if acc_ids:
        db.query(AccountBalance).filter(AccountBalance.account_id.in_(acc_ids)).delete(synchronize_session=False)
    db.query(Account).filter(Account.user_id == user_id).delete(synchronize_session=False)
    db.query(AccountGroup).filter(AccountGroup.user_id == user_id).delete(synchronize_session=False)
    db.query(Category).filter(Category.user_id == user_id).delete(synchronize_session=False)
    db.query(UserCurrency).filter(UserCurrency.user_id == user_id).delete(synchronize_session=False)
    db.delete(u)
    db.commit()


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
    premium = db.query(User).filter(User.is_premium == True).count()
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
        premium_users=premium,
        admin_users=admins,
        total_accounts=accs,
        total_categories=cats,
        total_transactions=txs,
        new_users_last_7d=new_7d,
        new_users_last_30d=new_30d,
        new_signups_by_day=new_signups_by_day,
    )
