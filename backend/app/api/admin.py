from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.api.financial_dependencies import financial_db
from app.models.user import User
from app.schemas.admin import AdminUserSummary, AdminUsersPage, AdminUserUpdate, AdminPasswordReset, AdminStats, AdminConfig, AdminConfigUpdate
from app.schemas.notification import AdminNotificationCreate
from app.operations.admin import commands, queries


security = HTTPBearer()

router = APIRouter(prefix="/api/admin", tags=["admin"])

def get_admin_user_id(
    user_id: int = Depends(current_user_id),
    db: Session = Depends(get_db),
) -> int:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user_id

@router.post("/notifications", status_code=201)
def create_notification(
    data: AdminNotificationCreate,
    db: Session = Depends(financial_db, scope="function"),
    _: int = Depends(get_admin_user_id),
):
    return operation_response(commands.create_notification(data=data, db=db, _=_))


@router.get("/users", response_model=AdminUsersPage)
def list_users(
    q: Optional[str] = Query(None, description="Поиск по email или username"),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(financial_db, scope="function"),
    _: int = Depends(get_admin_user_id),
):
    return operation_response(queries.list_users(q=q, is_active=is_active, limit=limit, offset=offset, db=db, _=_))


@router.get("/users/{user_id}", response_model=AdminUserSummary)
def get_user(
    user_id: int,
    db: Session = Depends(financial_db, scope="function"),
    _: int = Depends(get_admin_user_id),
):
    return operation_response(queries.get_user(user_id=user_id, db=db, _=_))


@router.patch("/users/{user_id}", response_model=AdminUserSummary)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    background: BackgroundTasks,
    db: Session = Depends(financial_db, scope="function"),
    admin_id: int = Depends(get_admin_user_id),
):
    return operation_response(commands.update_user(user_id=user_id, data=data, background=background, db=db, admin_id=admin_id))


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_password(
    user_id: int,
    data: AdminPasswordReset,
    db: Session = Depends(financial_db, scope="function"),
    _: int = Depends(get_admin_user_id),
):
    return operation_response(commands.reset_password(user_id=user_id, data=data, db=db, _=_))


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(financial_db, scope="function"),
    admin_id: int = Depends(get_admin_user_id),
):
    return operation_response(commands.delete_user(user_id=user_id, db=db, admin_id=admin_id))


@router.get("/config", response_model=AdminConfig)
def get_app_config(
    db: Session = Depends(financial_db, scope="function"),
    _: int = Depends(get_admin_user_id),
):
    return operation_response(queries.get_app_config(db=db, _=_))


@router.patch("/config", response_model=AdminConfig)
def update_app_config(
    data: AdminConfigUpdate,
    db: Session = Depends(financial_db, scope="function"),
    _: int = Depends(get_admin_user_id),
):
    return operation_response(commands.update_app_config(data=data, db=db, _=_))


@router.get("/stats", response_model=AdminStats)
def get_stats(
    db: Session = Depends(financial_db, scope="function"),
    _: int = Depends(get_admin_user_id),
):
    return operation_response(queries.get_stats(db=db, _=_))
