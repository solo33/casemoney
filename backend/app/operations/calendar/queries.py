"""Calendar: queries. Callers supply resolved user and database session."""
from datetime import date, timedelta
from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.models.user import User
from app.services.plans import ensure_family_plan
from app.services.upcoming_events import list_upcoming_events
from app.operations.calendar.common import _ensure_token, _event, _require_user, _rrule, _subscription_url


def calendar_subscription(db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    user = _require_user(db, user_id)
    token = _ensure_token(user)
    db.commit()
    return {"url": _subscription_url(token)}


def calendar_events(days: int=366, db: Session=None, user_id: int=None):
    """Canonical upcoming events used by the planning screen and dashboard."""
    ensure_family_plan(db, user_id)
    days = max(1, min(days, 730))
    start = date.today()
    return list_upcoming_events(db, user_id, start, start + timedelta(days=days))


def calendar_feed(token: str, db: Session=None):
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
