"""Plan limits.

Current public plan is Personal. All existing features are available without
limits; paid plans will be introduced later around new automation features.
"""

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.category import Category
from app.models.user_currency import UserCurrency
from app.models.user import User


def get_limits_status(db: Session, user_id: int) -> dict:
    """Return current usage and active plan metadata."""
    usage = {
        "accounts": db.query(Account).filter(Account.user_id == user_id).count(),
        "categories": db.query(Category).filter(Category.user_id == user_id).count(),
        "user_currencies": db.query(UserCurrency).filter(UserCurrency.user_id == user_id).count(),
    }
    user = db.query(User).filter(User.id == user_id).first()
    return {
        "plan": user.plan if user else "personal",
        "limits": None,
        "usage": usage,
    }


def enforce_limit(db: Session, user_id: int, kind: str) -> None:
    """Personal currently has no limits for existing features."""
    return
