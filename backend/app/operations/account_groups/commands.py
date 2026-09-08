"""Account_groups: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.account_group import AccountGroup
from app.schemas.account_group import AccountGroupCreate, AccountGroupUpdate



def create_group(data: AccountGroupCreate, db: Session=None, user_id: int=None):
    group = AccountGroup(**data.model_dump(), user_id=user_id)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def update_group(group_id: int, data: AccountGroupUpdate, db: Session=None, user_id: int=None):
    group = db.query(AccountGroup).filter(
        AccountGroup.id == group_id,
        AccountGroup.user_id == user_id,
    ).first()
    if not group:
        raise ApplicationError(status_code=404, detail="Group not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(group, key, value)
    db.commit()
    db.refresh(group)
    return group


def delete_group(group_id: int, db: Session=None, user_id: int=None):
    """Удаление группы. Связанные счета остаются (FK ON DELETE SET NULL)."""
    group = db.query(AccountGroup).filter(
        AccountGroup.id == group_id,
        AccountGroup.user_id == user_id,
    ).first()
    if not group:
        raise ApplicationError(status_code=404, detail="Group not found")
    db.delete(group)
    db.commit()
