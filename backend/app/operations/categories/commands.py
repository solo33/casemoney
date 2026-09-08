"""Categories: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryReorder
from app.services import limits as limits_svc
from app.operations.categories.common import _next_sort_order, _validate_parent


def create_category(data: CategoryCreate, db: Session=None, user_id: int=None):
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


def update_category(category_id: int, data: CategoryUpdate, db: Session=None, user_id: int=None):
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user_id,
    ).first()
    if not category:
        raise ApplicationError(status_code=404, detail="Category not found")

    update_fields = data.model_dump(exclude_unset=True)

    # The fallback category is needed to correct old imports and operations,
    # therefore it must always stay in the entry picker.
    if (
        update_fields.get("is_hidden") is True
        and category.name.strip().casefold() == "без категории"
    ):
        raise ApplicationError(
            status_code=400,
            detail="Категорию «Без категории» нельзя скрыть при вводе",
        )

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
            raise ApplicationError(
                status_code=400,
                detail=f"Тип не совпадает с родителем ({parent.type}). Сначала измените родителя.",
            )

    for key, value in update_fields.items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


def reorder_categories(data: CategoryReorder, db: Session=None, user_id: int=None):
    """Сохраняет порядок категорий среди соседей одного уровня и типа."""
    if not data.category_ids:
        return None
    if len(data.category_ids) != len(set(data.category_ids)):
        raise ApplicationError(status_code=400, detail="Категории в списке не должны повторяться")

    categories = db.query(Category).filter(
        Category.user_id == user_id,
        Category.id.in_(data.category_ids),
    ).all()
    if len(categories) != len(data.category_ids):
        raise ApplicationError(status_code=404, detail="Одна или несколько категорий не найдены")

    expected_parent = data.parent_id
    if any(category.parent_id != expected_parent for category in categories):
        raise ApplicationError(status_code=400, detail="Можно менять порядок только у категорий одного уровня")
    if len({category.type for category in categories}) != 1:
        raise ApplicationError(status_code=400, detail="Нельзя смешивать доходы и расходы")

    by_id = {category.id: category for category in categories}
    for index, category_id in enumerate(data.category_ids):
        by_id[category_id].sort_order = index
    db.commit()
    return None


def delete_category(category_id: int, db: Session=None, user_id: int=None):
    """Удаление каскадно удалит все дочерние (ON DELETE CASCADE на parent_id)."""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user_id,
    ).first()
    if not category:
        raise ApplicationError(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()
