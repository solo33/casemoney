from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.category import Category
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryTreeNode,
)
from app.services.auth import decode_token

router = APIRouter(prefix="/api/categories", tags=["categories"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


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
        raise HTTPException(status_code=400, detail="Категория не может быть родителем самой себе")

    parent = db.query(Category).filter(
        Category.id == parent_id,
        Category.user_id == user_id,
    ).first()
    if not parent:
        raise HTTPException(status_code=400, detail="Родительская категория не найдена")

    if parent.parent_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Максимальная глубина иерархии — 2 уровня. Нельзя вложить в подкатегорию.",
        )

    if child_type is not None and parent.type != child_type:
        raise HTTPException(
            status_code=400,
            detail=f"Тип категории ({child_type}) не совпадает с типом родителя ({parent.type})",
        )

    if has_children:
        raise HTTPException(
            status_code=400,
            detail="Категория содержит дочерние — её нельзя сделать дочерней (превысит глубину 2)",
        )


@router.get("/", response_model=List[CategoryResponse])
def get_categories(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Плоский список всех категорий — для select-форм и быстрых выборок."""
    return db.query(Category).filter(Category.user_id == user_id).all()


@router.get("/tree", response_model=List[CategoryTreeNode])
def get_categories_tree(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Вложенное дерево категорий. Корневые на верхнем уровне, в children — подкатегории."""
    all_cats = db.query(Category).filter(Category.user_id == user_id).all()

    # Группируем детей по parent_id (один проход)
    children_map: dict[int, list[Category]] = {}
    for c in all_cats:
        if c.parent_id is not None:
            children_map.setdefault(c.parent_id, []).append(c)

    def to_node(cat: Category) -> CategoryTreeNode:
        kids = children_map.get(cat.id, [])
        # сортируем детей по имени для стабильного порядка
        kids_sorted = sorted(kids, key=lambda x: x.name.lower())
        return CategoryTreeNode(
            id=cat.id,
            name=cat.name,
            type=cat.type,
            color=cat.color,
            icon=cat.icon,
            is_default=cat.is_default,
            parent_id=cat.parent_id,
            children=[to_node(k) for k in kids_sorted],
        )

    roots = [c for c in all_cats if c.parent_id is None]
    roots_sorted = sorted(roots, key=lambda x: (x.type, x.name.lower()))
    return [to_node(r) for r in roots_sorted]


@router.post("/", response_model=CategoryResponse, status_code=201)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _validate_parent(
        db,
        user_id=user_id,
        parent_id=data.parent_id,
        self_id=None,
        child_type=data.type,
        has_children=False,  # новая категория без детей
    )
    category = Category(**data.model_dump(), user_id=user_id)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user_id,
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    update_fields = data.model_dump(exclude_unset=True)

    # Если меняется parent_id или type — пересчитываем валидацию
    if "parent_id" in update_fields:
        new_parent_id = update_fields["parent_id"]
        new_type = update_fields.get("type", category.type)
        has_children = db.query(Category).filter(
            Category.parent_id == category_id
        ).count() > 0
        _validate_parent(
            db,
            user_id=user_id,
            parent_id=new_parent_id,
            self_id=category_id,
            child_type=new_type,
            has_children=has_children,
        )

    # Если меняется только type, у родителя должен совпасть тип
    if "type" in update_fields and "parent_id" not in update_fields and category.parent_id is not None:
        parent = db.query(Category).filter(Category.id == category.parent_id).first()
        if parent and parent.type != update_fields["type"]:
            raise HTTPException(
                status_code=400,
                detail=f"Тип не совпадает с родителем ({parent.type}). Сначала измените родителя.",
            )

    for key, value in update_fields.items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Удаление каскадно удалит все дочерние (ON DELETE CASCADE на parent_id)."""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user_id,
        Category.is_default == False,
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found or is default")
    db.delete(category)
    db.commit()
