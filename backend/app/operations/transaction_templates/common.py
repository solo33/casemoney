"""Transaction_templates: common. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import TransactionType
from app.schemas.transaction_template import TransactionTemplateCreate



def _validate_references(db: Session, user_id: int, data: TransactionTemplateCreate) -> TransactionType:
    try:
        tx_type = TransactionType[data.type]
    except KeyError:
        raise ApplicationError(status_code=400, detail="Invalid transaction type")
    if data.account_id and not db.query(Account.id).filter(Account.id == data.account_id, Account.user_id == user_id).first():
        raise ApplicationError(status_code=404, detail="Account not found")
    if data.category_id and not db.query(Category.id).filter(Category.id == data.category_id, Category.user_id == user_id).first():
        raise ApplicationError(status_code=404, detail="Category not found")
    return tx_type
