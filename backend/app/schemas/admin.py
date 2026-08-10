from pydantic import BaseModel, EmailStr
from typing import List, Literal, Optional
from datetime import datetime


class AdminUserSummary(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    is_admin: bool
    main_currency: str
    plan: Literal["personal", "family"]
    plan_source: str = "default"
    plan_expires_at: Optional[datetime] = None
    family_upgrade_enabled: bool = False
    created_at: Optional[datetime]
    accounts_count: int = 0
    categories_count: int = 0
    transactions_count: int = 0


class AdminUsersPage(BaseModel):
    items: List[AdminUserSummary]
    total: int
    limit: int
    offset: int


class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    plan: Optional[Literal["personal", "family"]] = None
    family_upgrade_enabled: Optional[bool] = None


class AdminPasswordReset(BaseModel):
    new_password: str


class AdminConfig(BaseModel):
    require_email_verification: bool
    smtp_configured: bool
    registration_enabled: bool


class AdminConfigUpdate(BaseModel):
    require_email_verification: Optional[bool] = None
    registration_enabled: Optional[bool] = None


class AdminStats(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_accounts: int
    total_categories: int
    total_transactions: int
    new_users_last_7d: int
    new_users_last_30d: int
    new_signups_by_day: List[dict]   # [{date: '2026-05-29', count: 3}, ...]
