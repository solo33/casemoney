"""Transaction_templates: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.transaction_template import TransactionTemplate
from app.schemas.transaction_template import TransactionTemplateCreate
from app.operations.transaction_templates.common import _validate_references


def create_template(data: TransactionTemplateCreate, db: Session=None, user_id: int=None):
    template = TransactionTemplate(
        user_id=user_id, name=data.name.strip(), type=_validate_references(db, user_id, data),
        amount=data.amount, currency=data.currency.upper(), account_id=data.account_id,
        category_id=data.category_id, description=data.description,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def delete_template(template_id: int, db: Session=None, user_id: int=None):
    template = db.query(TransactionTemplate).filter(TransactionTemplate.id == template_id, TransactionTemplate.user_id == user_id).first()
    if not template:
        raise ApplicationError(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
