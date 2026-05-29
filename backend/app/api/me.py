from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.services.auth import decode_token

router = APIRouter(prefix="/api/me", tags=["me"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


@router.get("/", response_model=UserResponse)
def get_me(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    update_fields = data.model_dump(exclude_unset=True)
    if "main_currency" in update_fields and update_fields["main_currency"]:
        update_fields["main_currency"] = update_fields["main_currency"].upper()
    for k, v in update_fields.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user
