from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.shopping import ShoppingItem, ShoppingList
from app.models.transaction import Transaction
from app.schemas.shopping import (
    ShoppingItemCreate, ShoppingItemResponse, ShoppingItemUpdate,
    ShoppingListCreate, ShoppingListResponse, ShoppingListUpdate, ShoppingSuggestion,
)
from app.services.auth import decode_token

router = APIRouter(prefix="/api/shopping", tags=["shopping"])
security = HTTPBearer()


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _default_list(db: Session, user_id: int) -> ShoppingList:
    current = db.query(ShoppingList).filter(
        ShoppingList.user_id == user_id, ShoppingList.is_default.is_(True)
    ).first()
    if current:
        return current
    current = ShoppingList(user_id=user_id, name="Покупки", is_default=True)
    db.add(current)
    db.commit()
    db.refresh(current)
    return current


def _get_list(db: Session, user_id: int, list_id: int) -> ShoppingList:
    result = db.query(ShoppingList).filter(
        ShoppingList.id == list_id, ShoppingList.user_id == user_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Список покупок не найден")
    return result


def _get_item(db: Session, user_id: int, item_id: int) -> ShoppingItem:
    result = db.query(ShoppingItem).join(ShoppingList).filter(
        ShoppingItem.id == item_id, ShoppingList.user_id == user_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Позиция списка не найдена")
    return result


def _validate_category(db: Session, user_id: int, category_id: Optional[int]) -> None:
    if category_id is None:
        return
    if not db.query(Category.id).filter(Category.id == category_id, Category.user_id == user_id).first():
        raise HTTPException(status_code=404, detail="Категория не найдена")


def _validate_transaction(db: Session, user_id: int, transaction_id: Optional[int]) -> None:
    if transaction_id is None:
        return
    transaction = db.query(Transaction.id).filter(
        Transaction.id == transaction_id, Transaction.user_id == user_id
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")


@router.get("/lists", response_model=List[ShoppingListResponse])
def list_lists(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    _default_list(db, user_id)
    return db.query(ShoppingList).filter(ShoppingList.user_id == user_id).order_by(
        ShoppingList.is_default.desc(), ShoppingList.name.asc()
    ).all()


@router.post("/lists", response_model=ShoppingListResponse, status_code=201)
def create_list(data: ShoppingListCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    _default_list(db, user_id)
    result = ShoppingList(user_id=user_id, name=data.name.strip(), is_default=False)
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.patch("/lists/{list_id}", response_model=ShoppingListResponse)
def update_list(list_id: int, data: ShoppingListUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    result = _get_list(db, user_id, list_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("is_default"):
        db.query(ShoppingList).filter(ShoppingList.user_id == user_id).update({ShoppingList.is_default: False})
    for key, value in changes.items():
        setattr(result, key, value.strip() if key == "name" else value)
    db.commit()
    db.refresh(result)
    return result


@router.delete("/lists/{list_id}", status_code=204)
def delete_list(list_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    result = _get_list(db, user_id, list_id)
    if result.is_default:
        raise HTTPException(status_code=400, detail="Основной список нельзя удалить — переименуйте его или выберите другой основным")
    db.delete(result)
    db.commit()


@router.get("/lists/{list_id}/items", response_model=List[ShoppingItemResponse])
def list_items(list_id: int, include_bought: bool = Query(False), db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    _get_list(db, user_id, list_id)
    query = db.query(ShoppingItem).filter(ShoppingItem.list_id == list_id)
    if not include_bought:
        query = query.filter(ShoppingItem.status == "planned")
    return query.order_by(ShoppingItem.status.asc(), ShoppingItem.created_at.desc()).all()


@router.post("/lists/{list_id}/items", response_model=ShoppingItemResponse, status_code=201)
def create_item(list_id: int, data: ShoppingItemCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    _get_list(db, user_id, list_id)
    _validate_category(db, user_id, data.category_id)
    result = ShoppingItem(list_id=list_id, **data.model_dump())
    result.name = result.name.strip()
    result.currency = result.currency.upper()
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.patch("/items/{item_id}", response_model=ShoppingItemResponse)
def update_item(item_id: int, data: ShoppingItemUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
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


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    result = _get_item(db, user_id, item_id)
    db.delete(result)
    db.commit()


@router.get("/history", response_model=List[ShoppingSuggestion])
def purchase_history(q: str = "", limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
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
