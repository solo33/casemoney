from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Literal, Optional


class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    main_currency: str = "RUB"
    plan: Literal["personal", "family"] = "personal"
    plan_source: str = "default"
    plan_expires_at: Optional[datetime] = None
    family_upgrade_enabled: bool = False
    show_shopping_button_mobile: bool = True
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
    onboarding_completed: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=4)


class Token(BaseModel):
    access_token: str
    token_type: str
