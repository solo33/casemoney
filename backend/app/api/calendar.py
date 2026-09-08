"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as _current_user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.operations.calendar import queries, commands


router = APIRouter(prefix="/api/calendar", tags=["calendar"])

@router.get("/subscription")
def calendar_subscription(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    return queries.calendar_subscription(db=db, user_id=user_id)


@router.post("/subscription/rotate")
def rotate_calendar_subscription(db: Session = Depends(get_db), user_id: int = Depends(_current_user_id)):
    return commands.rotate_calendar_subscription(db=db, user_id=user_id)


@router.get("/events")
def calendar_events(
    days: int = 366,
    db: Session = Depends(get_db),
    user_id: int = Depends(_current_user_id),
):
    'Canonical upcoming events used by the planning screen and dashboard.'
    return queries.calendar_events(days=days, db=db, user_id=user_id)


@router.get("/feed/{token}.ics", include_in_schema=False)
def calendar_feed(token: str, db: Session = Depends(get_db)):
    return queries.calendar_feed(token=token, db=db)
