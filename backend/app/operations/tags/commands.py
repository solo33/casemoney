"""Tags: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.transaction_tag import Tag
from app.schemas.tag import TagCreate, TagUpdate
from app.operations.tags.common import _normalise_name


def create_tag(data: TagCreate, db: Session=None, user_id: int=None):
    tag = Tag(user_id=user_id, name=_normalise_name(data.name), color=data.color)
    db.add(tag)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApplicationError(status_code=409, detail="Такая метка уже есть")
    db.refresh(tag)
    return tag


def update_tag(tag_id: int, data: TagUpdate, db: Session=None, user_id: int=None):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user_id).first()
    if not tag:
        raise ApplicationError(status_code=404, detail="Метка не найдена")
    if data.name is not None:
        tag.name = _normalise_name(data.name)
    if data.color is not None:
        tag.color = data.color
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApplicationError(status_code=409, detail="Такая метка уже есть")
    db.refresh(tag)
    return tag


def delete_tag(tag_id: int, db: Session=None, user_id: int=None):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user_id).first()
    if not tag:
        raise ApplicationError(status_code=404, detail="Метка не найдена")
    db.delete(tag)
    db.commit()
