from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.financial_dependencies import financial_db
from app.schemas.shopping import ShoppingItemCreate, ShoppingItemResponse, ShoppingItemUpdate, ShoppingListCreate, ShoppingListResponse, ShoppingListUpdate, ShoppingSuggestion
from app.operations.shopping import queries, commands


router = APIRouter(prefix="/api/shopping", tags=["shopping"])

@router.get("/lists", response_model=List[ShoppingListResponse])
def list_lists(db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(queries.list_lists(db=db, user_id=user_id))


@router.post("/lists", response_model=ShoppingListResponse, status_code=201)
def create_list(data: ShoppingListCreate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.create_list(data=data, db=db, user_id=user_id))


@router.patch("/lists/{list_id}", response_model=ShoppingListResponse)
def update_list(list_id: int, data: ShoppingListUpdate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.update_list(list_id=list_id, data=data, db=db, user_id=user_id))


@router.delete("/lists/{list_id}", status_code=204)
def delete_list(list_id: int, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.delete_list(list_id=list_id, db=db, user_id=user_id))


@router.get("/lists/{list_id}/items", response_model=List[ShoppingItemResponse])
def list_items(list_id: int, include_bought: bool = Query(False), db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(queries.list_items(list_id=list_id, include_bought=include_bought, db=db, user_id=user_id))


@router.post("/lists/{list_id}/items", response_model=ShoppingItemResponse, status_code=201)
def create_item(list_id: int, data: ShoppingItemCreate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.create_item(list_id=list_id, data=data, db=db, user_id=user_id))


@router.patch("/items/{item_id}", response_model=ShoppingItemResponse)
def update_item(item_id: int, data: ShoppingItemUpdate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.update_item(item_id=item_id, data=data, db=db, user_id=user_id))


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.delete_item(item_id=item_id, db=db, user_id=user_id))


@router.get("/history", response_model=List[ShoppingSuggestion])
def purchase_history(q: str = "", limit: int = Query(30, ge=1, le=100), db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(queries.purchase_history(q=q, limit=limit, db=db, user_id=user_id))
