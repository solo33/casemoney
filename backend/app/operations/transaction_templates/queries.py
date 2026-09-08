"""Transaction_templates: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.models.transaction_template import TransactionTemplate



def list_templates(db: Session=None, user_id: int=None):
    return db.query(TransactionTemplate).filter(TransactionTemplate.user_id == user_id).order_by(TransactionTemplate.name.asc()).all()
