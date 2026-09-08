"""Shopping: queries. Callers supply resolved user and database session."""
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.shopping import ShoppingItem, ShoppingList
from app.schemas.shopping import ShoppingSuggestion
from app.operations.shopping.common import _default_list, _family_id, _get_list


def list_lists(db: Session=None, user_id: int=None):
    _default_list(db, user_id)
    family_id = _family_id(db, user_id)
    return db.query(ShoppingList).filter((ShoppingList.user_id == user_id) | (ShoppingList.family_id == family_id if family_id else -1)).order_by(
        ShoppingList.is_default.desc(), ShoppingList.name.asc()
    ).all()


def list_items(list_id: int, include_bought: bool=False, db: Session=None, user_id: int=None):
    _get_list(db, user_id, list_id)
    query = db.query(ShoppingItem).filter(ShoppingItem.list_id == list_id)
    if not include_bought:
        query = query.filter(ShoppingItem.status == "planned")
    return query.order_by(ShoppingItem.status.asc(), ShoppingItem.created_at.desc()).all()


def purchase_history(q: str='', limit: int=30, db: Session=None, user_id: int=None):
    query = db.query(
        ShoppingItem.name,
        ShoppingItem.quantity,
        ShoppingItem.unit,
        ShoppingItem.actual_price,
        ShoppingItem.planned_price,
        ShoppingItem.currency,
        ShoppingItem.category_id,
        func.count(ShoppingItem.id).label("used_count"),
        func.max(ShoppingItem.purchased_at).label("last_used"),
    ).join(ShoppingList).filter(
        ShoppingList.user_id == user_id, ShoppingItem.status == "bought"
    )
    if q.strip():
        query = query.filter(ShoppingItem.name.ilike(f"%{q.strip()}%"))
    rows = query.group_by(
        ShoppingItem.name, ShoppingItem.quantity, ShoppingItem.unit,
        ShoppingItem.actual_price, ShoppingItem.planned_price, ShoppingItem.currency, ShoppingItem.category_id,
    ).order_by(func.max(ShoppingItem.purchased_at).desc(), func.count(ShoppingItem.id).desc()).limit(limit).all()
    return [ShoppingSuggestion(
        name=row.name, quantity=row.quantity, unit=row.unit,
        planned_price=row.actual_price if row.actual_price is not None else row.planned_price,
        currency=row.currency, category_id=row.category_id, used_count=row.used_count,
    ) for row in rows]
