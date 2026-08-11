from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.category import Category
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryTreeNode,
    CategoryReorder,
)
from app.services.auth import decode_token
from app.services import limits as limits_svc

router = APIRouter(prefix="/api/categories", tags=["categories"])
security = HTTPBearer()


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
    return (
        db.query(Category)
        .filter(Category.user_id == user_id)
        .order_by(Category.type, Category.parent_id, Category.sort_order, func.lower(Category.name), Category.id)
        .all()
    )


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
        kids_sorted = sorted(kids, key=lambda x: (x.sort_order, x.name.lower(), x.id))
        return CategoryTreeNode(
            id=cat.id,
            name=cat.name,
            type=cat.type,
            color=cat.color,
            icon=cat.icon,
            is_default=cat.is_default,
            is_hidden=cat.is_hidden,
            parent_id=cat.parent_id,
            sort_order=cat.sort_order,
            children=[to_node(k) for k in kids_sorted],
        )

    roots = [c for c in all_cats if c.parent_id is None]
    roots_sorted = sorted(roots, key=lambda x: (x.type, x.sort_order, x.name.lower(), x.id))
    return [to_node(r) for r in roots_sorted]


@router.post("/", response_model=CategoryResponse, status_code=201)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    limits_svc.enforce_limit(db, user_id, "categories")
    _validate_parent(
        db,
        user_id=user_id,
        parent_id=data.parent_id,
        self_id=None,
        child_type=data.type,
        has_children=False,  # новая категория без детей
    )
    category = Category(
        **data.model_dump(),
        user_id=user_id,
        sort_order=_next_sort_order(db, user_id, data.parent_id, data.type),
    )
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
        if new_parent_id != category.parent_id:
            category.sort_order = _next_sort_order(db, user_id, new_parent_id, new_type)

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


@router.post("/reorder", status_code=204)
def reorder_categories(
    data: CategoryReorder,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Сохраняет порядок категорий среди соседей одного уровня и типа."""
    if not data.category_ids:
        return None
    if len(data.category_ids) != len(set(data.category_ids)):
        raise HTTPException(status_code=400, detail="Категории в списке не должны повторяться")

    categories = db.query(Category).filter(
        Category.user_id == user_id,
        Category.id.in_(data.category_ids),
    ).all()
    if len(categories) != len(data.category_ids):
        raise HTTPException(status_code=404, detail="Одна или несколько категорий не найдены")

    expected_parent = data.parent_id
    if any(category.parent_id != expected_parent for category in categories):
        raise HTTPException(status_code=400, detail="Можно менять порядок только у категорий одного уровня")
    if len({category.type for category in categories}) != 1:
        raise HTTPException(status_code=400, detail="Нельзя смешивать доходы и расходы")

    by_id = {category.id: category for category in categories}
    for index, category_id in enumerate(data.category_ids):
        by_id[category_id].sort_order = index
    db.commit()
    return None


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
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()
