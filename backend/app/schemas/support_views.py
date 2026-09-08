from pydantic import BaseModel, EmailStr, Field


class SupportContactRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    message: str = Field(..., min_length=10, max_length=4000)


class SupportContactResponse(BaseModel):
    ok: bool
    support_email: EmailStr
