"""Account_groups: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.models.account_group import AccountGroup



def get_groups(db: Session=None, user_id: int=None):
    return (
        db.query(AccountGroup)
        .filter(AccountGroup.user_id == user_id)
        .order_by(AccountGroup.sort_order, AccountGroup.id)
        .all()
    )
