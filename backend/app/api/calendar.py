"""Личная iCalendar-подписка для плановых и регулярных операций.

Google и Яндекс Календарь умеют подписываться на URL в формате iCalendar.
Так мы не просим доступ к чужому аккаунту и не храним OAuth-токены.
"""
from __future__ import annotations

import secrets
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth import decode_token
from app.services.email import app_url
from app.services.plans import ensure_family_plan
from app.services.upcoming_events import list_upcoming_events


router = APIRouter(prefix="/api/calendar", tags=["calendar"])
security = HTTPBearer()


def _current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


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


@router.get("/subscription")
def calendar_subscription(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    ensure_family_plan(db, user_id)
    user = _require_user(db, user_id)
    token = _ensure_token(user)
    db.commit()
    return {"url": _subscription_url(token)}


@router.post("/subscription/rotate")
def rotate_calendar_subscription(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    ensure_family_plan(db, user_id)
    user = _require_user(db, user_id)
    user.calendar_token = _token()
    db.commit()
    return {"url": _subscription_url(user.calendar_token)}


@router.get("/events")
def calendar_events(
    days: int = 366,
    db: Session = Depends(get_db),
    user_id: int = Depends(_current_user_id),
):
    """Canonical upcoming events used by the planning screen and dashboard."""
    ensure_family_plan(db, user_id)
    days = max(1, min(days, 730))
    start = date.today()
    return list_upcoming_events(db, user_id, start, start + timedelta(days=days))


@router.get("/feed/{token}.ics", include_in_schema=False)
def calendar_feed(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.calendar_token == token).first()
    if not user or user.plan != "family":
        raise HTTPException(status_code=404, detail="Календарь не найден")

    start = date.today()
    end = start + timedelta(days=366)
    events = list_upcoming_events(db, user.id, start, end)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CaseMoney//Schedule//RU",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:CaseMoney — Расписание",
    ]
    for item in events:
        prefix = "Доход" if item["type"] == "income" else "Расход"
        title = f"{prefix}: {item['title']} — {item['amount']:g} {item['currency']}"
        rrule = _rrule(item.get("frequency", "monthly")) if item["source"] == "recurring" else None
        lines.extend(_event(
            title, item["date"], item["id"],
            item.get("description") or "Будущая операция CaseMoney", rrule=rrule,
        ))
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "private, max-age=300"})
