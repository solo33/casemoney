from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Any, Literal, Optional


class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
    preferred_mode: Literal["personal", "family"] = "personal"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    main_currency: str = "RUB"
    plan: Literal["personal", "family"] = "personal"
    preferred_mode: Literal["personal", "family"] = "personal"
    plan_source: str = "default"
    plan_expires_at: Optional[datetime] = None
    family_upgrade_enabled: bool = False
    # Whether Family features are actually unlocked right now — true for every
    # user during the free launch period (app_config.billing_enabled = False),
    # regardless of `plan`. Use this for gating UI, not `plan == "family"`.
    family_access: bool = False
    show_shopping_button_mobile: bool = True
    hide_zero_balance_currencies: bool = False
    dashboard_widgets: dict[str, Any] = Field(default_factory=dict)
    notification_preferences: dict[str, Any] = Field(default_factory=dict)
    onboarding_completed: bool = False
    is_admin: bool = False
    email_verified: bool = True

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    main_currency: Optional[str] = Field(None, min_length=2, max_length=10)
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, min_length=1, max_length=64)
    show_shopping_button_mobile: Optional[bool] = None
    hide_zero_balance_currencies: Optional[bool] = None
    dashboard_widgets: Optional[dict[str, Any]] = None
    notification_preferences: Optional[dict[str, Any]] = None
    onboarding_completed: Optional[bool] = None
    preferred_mode: Optional[Literal["personal", "family"]] = None
    # Нужен отдельный явный флаг: переход владельца в Personal может удалить
    # общее пространство, но никогда не должен происходить случайно.
    confirm_family_data_cleanup: bool = False


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=4)


class Token(BaseModel):
    access_token: str
    token_type: str
