"""HTTP routes; application operations own validation and transaction boundaries."""
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.dependencies import require_family_user_id
from app.database import get_db
from app.schemas.transaction_template import TransactionTemplateCreate, TransactionTemplateResponse
from app.operations.transaction_templates import queries, commands


router = APIRouter(prefix="/api/transaction-templates", tags=["transaction templates"])

@router.get("/", response_model=List[TransactionTemplateResponse])
def list_templates(db: Session = Depends(get_db), user_id: int = Depends(require_family_user_id)):
    return queries.list_templates(db=db, user_id=user_id)


@router.post("/", response_model=TransactionTemplateResponse, status_code=201)
def create_template(data: TransactionTemplateCreate, db: Session = Depends(get_db), user_id: int = Depends(require_family_user_id)):
    return commands.create_template(data=data, db=db, user_id=user_id)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db), user_id: int = Depends(require_family_user_id)):
    return commands.delete_template(template_id=template_id, db=db, user_id=user_id)
