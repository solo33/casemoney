"""Shopping: commands. Callers supply resolved user and database session."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.shopping import ShoppingItem, ShoppingList
from app.schemas.shopping import ShoppingItemCreate, ShoppingItemUpdate, ShoppingListCreate, ShoppingListUpdate
from app.operations.shopping.common import _default_list, _family_id, _get_item, _get_list, _validate_category, _validate_transaction


def create_list(data: ShoppingListCreate, db: Session=None, user_id: int=None):
    _default_list(db, user_id)
    family_id = _family_id(db, user_id)
    if data.is_shared and not family_id:
        raise HTTPException(status_code=400, detail="Сначала создайте семейное пространство")
    result = ShoppingList(user_id=user_id, name=data.name.strip(), is_default=False, family_id=family_id if data.is_shared else None)
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def update_list(list_id: int, data: ShoppingListUpdate, db: Session=None, user_id: int=None):
    result = _get_list(db, user_id, list_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("is_default"):
        db.query(ShoppingList).filter(ShoppingList.user_id == user_id).update({ShoppingList.is_default: False})
    for key, value in changes.items():
        setattr(result, key, value.strip() if key == "name" else value)
    db.commit()
    db.refresh(result)
    return result


def delete_list(list_id: int, db: Session=None, user_id: int=None):
    result = _get_list(db, user_id, list_id)
    if result.is_default:
        raise HTTPException(status_code=400, detail="Основной список нельзя удалить — переименуйте его или выберите другой основным")
    db.delete(result)
    db.commit()


def create_item(list_id: int, data: ShoppingItemCreate, db: Session=None, user_id: int=None):
    _get_list(db, user_id, list_id)
    _validate_category(db, user_id, data.category_id)
    result = ShoppingItem(list_id=list_id, **data.model_dump())
    result.name = result.name.strip()
    result.currency = result.currency.upper()
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def update_item(item_id: int, data: ShoppingItemUpdate, db: Session=None, user_id: int=None):
    result = _get_item(db, user_id, item_id)
    changes = data.model_dump(exclude_unset=True)
    _validate_category(db, user_id, changes.get("category_id", result.category_id))
    _validate_transaction(db, user_id, changes.get("transaction_id"))
    for key, value in changes.items():
        if key == "name" and value is not None:
            value = value.strip()
        if key == "currency" and value:
            value = value.upper()
        setattr(result, key, value)
    if changes.get("status") == "bought" and result.purchased_at is None:
        result.purchased_at = datetime.now(timezone.utc)
    elif changes.get("status") == "planned":
        result.purchased_at = None
    db.commit()
    db.refresh(result)
    return result


def delete_item(item_id: int, db: Session=None, user_id: int=None):
    result = _get_item(db, user_id, item_id)
    db.delete(result)
    db.commit()
