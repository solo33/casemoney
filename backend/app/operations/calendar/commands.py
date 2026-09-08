"""Calendar: commands. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.services.plans import ensure_family_plan
from app.operations.calendar.common import _require_user, _subscription_url, _token


def rotate_calendar_subscription(db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    user = _require_user(db, user_id)
    user.calendar_token = _token()
    db.commit()
    return {"url": _subscription_url(user.calendar_token)}
