"""Me: common. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserResponse
from app.services import plans as plans_svc



def _get_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ApplicationError(status_code=404, detail="User not found")
    return user


def _serialize(db: Session, user: User) -> UserResponse:
    data = UserResponse.model_validate(user)
    data.family_access = plans_svc.has_family_plan(db, user.id)
    return data
