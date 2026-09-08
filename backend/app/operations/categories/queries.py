"""Categories: queries. Callers supply resolved user and database session."""
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.category import Category
from app.schemas.category import CategoryTreeNode



def get_categories(db: Session=None, user_id: int=None):
    """Плоский список всех категорий — для select-форм и быстрых выборок."""
    return (
        db.query(Category)
        .filter(Category.user_id == user_id)
        .order_by(Category.type, Category.parent_id, Category.sort_order, func.lower(Category.name), Category.id)
        .all()
    )


def get_categories_tree(db: Session=None, user_id: int=None):
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
