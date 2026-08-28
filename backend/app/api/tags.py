from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.transaction_tag import Tag
from app.models.transaction import Transaction, TransactionType
from app.schemas.tag import TagCreate, TagResponse, TagUpdate
from app.services.auth import decode_token


router = APIRouter(prefix="/api/tags", tags=["tags"])
security = HTTPBearer()


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _normalise_name(name: str) -> str:
    value = " ".join(name.split())
    if not value:
        raise HTTPException(status_code=400, detail="Название метки не может быть пустым")
    return value


@router.get("/", response_model=list[TagResponse])
def list_tags(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    return db.query(Tag).filter(Tag.user_id == user_id).order_by(Tag.name.asc(), Tag.id.asc()).all()


@router.post("/", response_model=TagResponse, status_code=201)
def create_tag(data: TagCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    tag = Tag(user_id=user_id, name=_normalise_name(data.name), color=data.color)
    db.add(tag)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Такая метка уже есть")
    db.refresh(tag)
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: int, data: TagUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Метка не найдена")
    if data.name is not None:
        tag.name = _normalise_name(data.name)
    if data.color is not None:
        tag.color = data.color
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Такая метка уже есть")
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Метка не найдена")
    db.delete(tag)
    db.commit()


@router.get("/{tag_id}/report")
def tag_report(tag_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    """Compact all-time project report. Transfers do not form income/expense."""
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Метка не найдена")
    rows = (
        db.query(Transaction.type, Transaction.currency, func.sum(Transaction.amount).label("amount"))
        .join(Transaction.tags)
        .filter(Tag.id == tag.id, Transaction.is_planned.is_(False), Transaction.type != TransactionType.transfer)
        .group_by(Transaction.type, Transaction.currency)
        .order_by(Transaction.currency.asc(), Transaction.type.asc())
        .all()
    )
    return {
        "tag": {"id": tag.id, "name": tag.name, "color": tag.color},
        "totals": [
            {"type": row.type.value, "currency": row.currency, "amount": round(float(row.amount or 0), 2)}
            for row in rows
        ],
    }
