"""Calendar: common. Callers supply resolved user and database session."""
import secrets
from datetime import date, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.user import User
from app.services.email import app_url



def _token() -> str:
    return secrets.token_urlsafe(32)


def _ensure_token(user: User) -> str:
    if not user.calendar_token:
        user.calendar_token = _token()
    return user.calendar_token


def _subscription_url(token: str) -> str:
    return f"{app_url()}/api/calendar/feed/{token}.ics"


def _escape_ics(value: object | None) -> str:
    return str(value or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _event(title: str, event_date: date, uid: str, description: str = "", rrule: str | None = None) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}@casemoney",
        f"DTSTART;VALUE=DATE:{event_date.strftime('%Y%m%d')}",
    ]
    if rrule:
        lines.append(f"RRULE:{rrule}")
    else:
        lines.append(f"DTEND;VALUE=DATE:{(event_date + timedelta(days=1)).strftime('%Y%m%d')}")
    lines += [
        f"SUMMARY:{_escape_ics(title)}",
        f"DESCRIPTION:{_escape_ics(description)}",
        "END:VEVENT",
    ]
    return lines


def _rrule(frequency: str) -> str:
    return {
        "daily": "FREQ=DAILY",
        "weekly": "FREQ=WEEKLY",
        "biweekly": "FREQ=WEEKLY;INTERVAL=2",
        "yearly": "FREQ=YEARLY",
    }.get(frequency, "FREQ=MONTHLY")


def _require_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user
