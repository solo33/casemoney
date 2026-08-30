from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import require_family_user_id
from app.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import TransactionType
from app.models.transaction_template import TransactionTemplate
from app.schemas.transaction_template import TransactionTemplateCreate, TransactionTemplateResponse

router = APIRouter(prefix="/api/transaction-templates", tags=["transaction templates"])


def _validate_references(db: Session, user_id: int, data: TransactionTemplateCreate) -> TransactionType:
    try:
        tx_type = TransactionType[data.type]
    except KeyError:
        raise HTTPException(status_code=400, detail="Invalid transaction type")
    if data.account_id and not db.query(Account.id).filter(Account.id == data.account_id, Account.user_id == user_id).first():
        raise HTTPException(status_code=404, detail="Account not found")
    if data.category_id and not db.query(Category.id).filter(Category.id == data.category_id, Category.user_id == user_id).first():
        raise HTTPException(status_code=404, detail="Category not found")
    return tx_type


@router.get("/", response_model=List[TransactionTemplateResponse])
def list_templates(db: Session = Depends(get_db), user_id: int = Depends(require_family_user_id)):
    return db.query(TransactionTemplate).filter(TransactionTemplate.user_id == user_id).order_by(TransactionTemplate.name.asc()).all()


@router.post("/", response_model=TransactionTemplateResponse, status_code=201)
def create_template(data: TransactionTemplateCreate, db: Session = Depends(get_db), user_id: int = Depends(require_family_user_id)):
    template = TransactionTemplate(
        user_id=user_id, name=data.name.strip(), type=_validate_references(db, user_id, data),
        amount=data.amount, currency=data.currency.upper(), account_id=data.account_id,
        category_id=data.category_id, description=data.description,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db), user_id: int = Depends(require_family_user_id)):
    template = db.query(TransactionTemplate).filter(TransactionTemplate.id == template_id, TransactionTemplate.user_id == user_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
