from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.constants import SUPPORT_EMAIL
from app.services.email import send_support_email

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/support", tags=["support"])


class SupportContactRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    message: str = Field(..., min_length=10, max_length=4000)


class SupportContactResponse(BaseModel):
    ok: bool
    support_email: EmailStr


@router.post("/contact", response_model=SupportContactResponse)
@limiter.limit("5/hour")
def contact_support(data: SupportContactRequest, request: Request):
    sent = send_support_email(
        to_email=SUPPORT_EMAIL,
        sender_name=data.name.strip(),
        sender_email=str(data.email),
        message=data.message.strip(),
    )
    if not sent:
        raise HTTPException(status_code=503, detail="Не удалось отправить обращение. Напишите нам на почту напрямую.")
    return SupportContactResponse(ok=True, support_email=SUPPORT_EMAIL)
