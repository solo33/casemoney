"""Shopping: common. Callers supply resolved user and database session."""
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.category import Category
from app.models.shopping import ShoppingItem, ShoppingList
from app.models.family import FamilyMember
from app.models.transaction import Transaction



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


def _family_id(db: Session, user_id: int):
    member = db.query(FamilyMember).filter(FamilyMember.user_id == user_id, FamilyMember.status == "active").first()
    return member.family_id if member else None


def _get_list(db: Session, user_id: int, list_id: int) -> ShoppingList:
    family_id = _family_id(db, user_id)
    result = db.query(ShoppingList).filter(
        ShoppingList.id == list_id, (ShoppingList.user_id == user_id) | (ShoppingList.family_id == family_id if family_id else -1)
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
