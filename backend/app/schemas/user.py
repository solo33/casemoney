from pydantic import BaseModel, EmailStr, Field
from typing import Optional


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

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    main_currency: Optional[str] = Field(None, min_length=2, max_length=10)


class Token(BaseModel):
    access_token: str
    token_type: str
