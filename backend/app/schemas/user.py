from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


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
    is_premium: bool = False
    premium_until: Optional[datetime] = None
    is_admin: bool = False

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    main_currency: Optional[str] = Field(None, min_length=2, max_length=10)
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, min_length=1, max_length=64)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=4)


class Token(BaseModel):
    access_token: str
    token_type: str
