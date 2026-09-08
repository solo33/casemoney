"""Shared FastAPI dependencies for authenticated API endpoints.

Keeping token parsing and plan checks here prevents individual routers from
silently drifting apart in their access-control behaviour.
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import decode_token, credential_version
from app.models.user import User
import hmac
from app.services.plans import ensure_family_plan


security = HTTPBearer()


def current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> int:
    """Return the authenticated user's identifier or reject an invalid token."""
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        user = db.get(User, int(payload["sub"]))
    except (KeyError, ValueError, TypeError):
        user = None
    if not user or not user.is_active or not hmac.compare_digest(str(payload.get("cv", "")), credential_version(user.hashed_password)):
        raise HTTPException(status_code=401, detail="Сессия завершена. Войдите снова")
    return user.id


def require_family_user_id(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
) -> int:
    """Require Family access and return the authenticated user's identifier."""
    ensure_family_plan(db, user_id)
    return user_id
