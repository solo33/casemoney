"""Me: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.services import limits as limits_svc
from app.operations.me.common import _get_user, _serialize


def get_me(db: Session=None, user_id: int=None):
    return _serialize(db, _get_user(db, user_id))


def get_limits(db: Session=None, user_id: int=None):
    """Текущее использование + активный тариф."""
    return limits_svc.get_limits_status(db, user_id)
