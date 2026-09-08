from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.tag import TagCreate, TagResponse, TagUpdate
from app.operations.tags import queries, commands


router = APIRouter(prefix="/api/tags", tags=["tags"])

@router.get("/", response_model=list[TagResponse])
def list_tags(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(queries.list_tags(db=db, user_id=user_id))


@router.post("/", response_model=TagResponse, status_code=201)
def create_tag(data: TagCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.create_tag(data=data, db=db, user_id=user_id))


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: int, data: TagUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.update_tag(tag_id=tag_id, data=data, db=db, user_id=user_id))


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.delete_tag(tag_id=tag_id, db=db, user_id=user_id))


@router.get("/{tag_id}/report")
def tag_report(tag_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    'Compact all-time project report. Transfers do not form income/expense.'
    return operation_response(queries.tag_report(tag_id=tag_id, db=db, user_id=user_id))
