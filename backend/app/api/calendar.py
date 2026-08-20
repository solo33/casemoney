"""Личная iCalendar-подписка для плановых и регулярных операций.

Google и Яндекс Календарь умеют подписываться на URL в формате iCalendar.
Так мы не просим доступ к чужому аккаунту и не храним OAuth-токены.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.auth import decode_token
from app.services.email import app_url
from app.services.plans import ensure_family_plan


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


def _event(title: str, event_date: date, uid: str, description: str = "") -> list[str]:
    return [
        "BEGIN:VEVENT",
        f"UID:{uid}@casemoney",
        f"DTSTART;VALUE=DATE:{event_date.strftime('%Y%m%d')}",
        f"DTEND;VALUE=DATE:{(event_date + timedelta(days=1)).strftime('%Y%m%d')}",
        f"SUMMARY:{_escape_ics(title)}",
        f"DESCRIPTION:{_escape_ics(description)}",
        "END:VEVENT",
    ]


def _rrule(frequency: str) -> str:
    return {
        "daily": "FREQ=DAILY",
        "weekly": "FREQ=WEEKLY",
        "biweekly": "FREQ=WEEKLY;INTERVAL=2",
        "yearly": "FREQ=YEARLY",
    }.get(frequency, "FREQ=MONTHLY")


@router.get("/subscription")
def calendar_subscription(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    ensure_family_plan(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    token = _ensure_token(user)
    db.commit()
    return {"url": _subscription_url(token)}


@router.post("/subscription/rotate")
def rotate_calendar_subscription(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    ensure_family_plan(db, user_id)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.calendar_token = _token()
    db.commit()
    return {"url": _subscription_url(user.calendar_token)}


@router.get("/feed/{token}.ics", include_in_schema=False)
def calendar_feed(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.calendar_token == token).first()
    if not user or user.plan != "family":
        raise HTTPException(status_code=404, detail="Календарь не найден")

    start = date.today()
    end = start + timedelta(days=366)
    # ``transactions.date`` is timezone-aware DateTime.  Comparing it with a
    # plain date works in SQLite but is ambiguous for PostgreSQL, which powers
    # production.  Use explicit UTC boundaries for a predictable feed.
    start_at = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_at = datetime.combine(end, time.min, tzinfo=timezone.utc)
    planned = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.is_planned.is_(True),
        Transaction.date >= start_at,
        Transaction.date < end_at,
    ).order_by(Transaction.date.asc()).all()
    schedules = db.query(RecurringTransaction).filter(
        RecurringTransaction.user_id == user.id,
        RecurringTransaction.is_active.is_(True),
    ).all()

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CaseMoney//Schedule//RU",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:CaseMoney — Расписание",
    ]
    for transaction in planned:
        is_income = transaction.type == TransactionType.income
        prefix = "Доход" if is_income else "Расход"
        title = f"{prefix}: {transaction.description or 'Плановая операция'} — {transaction.amount:g} {transaction.currency}"
        lines.extend(_event(title, transaction.date.date(), f"planned-{transaction.id}", "Плановая операция CaseMoney"))
    for schedule in schedules:
        prefix = "Доход" if schedule.type == TransactionType.income else "Расход"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:recurring-{schedule.id}@casemoney",
            f"DTSTART;VALUE=DATE:{schedule.next_date.strftime('%Y%m%d')}",
            f"RRULE:{_rrule(schedule.frequency)}",
            f"SUMMARY:{_escape_ics(f'{prefix}: {schedule.name} — {schedule.amount:g} {schedule.currency}')}",
            f"DESCRIPTION:{_escape_ics(schedule.description or 'Повторяющаяся операция CaseMoney')}",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "private, max-age=300"})
