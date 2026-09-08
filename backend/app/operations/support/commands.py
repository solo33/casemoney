"""Support: commands. Callers supply resolved user and database session."""
from fastapi import HTTPException, Request
from app.constants import SUPPORT_EMAIL
from app.services.email import send_support_email
from app.schemas.support_views import SupportContactRequest, SupportContactResponse


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
