"""Categories: common. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional
from app.models.category import Category



def _next_sort_order(
    db: Session,
    user_id: int,
    parent_id: Optional[int],
    category_type: str,
) -> int:
    query = db.query(func.max(Category.sort_order)).filter(
        Category.user_id == user_id,
        Category.type == category_type,
    )
    if parent_id is None:
        query = query.filter(Category.parent_id.is_(None))
    else:
        query = query.filter(Category.parent_id == parent_id)
    current = query.scalar()
    return (current if current is not None else -1) + 1


def _validate_parent(
    db: Session,
    user_id: int,
    parent_id: Optional[int],
    self_id: Optional[int],
    child_type: Optional[str],
    has_children: bool,
) -> None:
    """Проверяет ограничения иерархии (max 2 уровня + бизнес-правила).

    - parent_id != self_id
    - parent существует, принадлежит пользователю
    - parent сам должен быть корневым (parent.parent_id == None) — ограничение глубины 2
    - parent.type == child.type (категории не смешиваются)
    - категория с детьми не может стать дочерней
    """
    if parent_id is None:
        return

    if self_id is not None and parent_id == self_id:
        raise ApplicationError(status_code=400, detail="Категория не может быть родителем самой себе")

    parent = db.query(Category).filter(
        Category.id == parent_id,
        Category.user_id == user_id,
    ).first()
    if not parent:
        raise ApplicationError(status_code=400, detail="Родительская категория не найдена")

    if parent.parent_id is not None:
        raise ApplicationError(
            status_code=400,
            detail="Максимальная глубина иерархии — 2 уровня. Нельзя вложить в подкатегорию.",
        )

    if child_type is not None and parent.type != child_type:
        raise ApplicationError(
            status_code=400,
            detail=f"Тип категории ({child_type}) не совпадает с типом родителя ({parent.type})",
        )

    if has_children:
        raise ApplicationError(
            status_code=400,
            detail="Категория содержит дочерние — её нельзя сделать дочерней (превысит глубину 2)",
        )
