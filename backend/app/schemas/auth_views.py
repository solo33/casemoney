from pydantic import BaseModel, EmailStr
from app.constants import VERIFICATION_GRACE_DAYS


class RegisterResponse(BaseModel):
    requires_code: bool        # нужно ли вводить код подтверждения
    smtp_configured: bool
    access_token: str | None = None
    token_type: str = "bearer"
    email_sent: bool = False
    verification_grace_days: int = VERIFICATION_GRACE_DAYS


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str


class PublicConfig(BaseModel):
    registration_enabled: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    ok: bool
    smtp_configured: bool


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ActivationResult(BaseModel):
    ok: bool
    message: str
    already_verified: bool = False


class ResendRequest(BaseModel):
    email: EmailStr


class ResendResponse(BaseModel):
    ok: bool
    message: str
