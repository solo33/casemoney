from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.api.financial_dependencies import financial_db
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryTreeNode, CategoryReorder
from app.operations.categories import queries, commands


router = APIRouter(prefix="/api/categories", tags=["categories"])

@router.get("/", response_model=List[CategoryResponse])
def get_categories(
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    'Плоский список всех категорий — для select-форм и быстрых выборок.'
    return operation_response(queries.get_categories(db=db, user_id=user_id))


@router.get("/tree", response_model=List[CategoryTreeNode])
def get_categories_tree(
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    'Вложенное дерево категорий. Корневые на верхнем уровне, в children — подкатегории.'
    return operation_response(queries.get_categories_tree(db=db, user_id=user_id))


@router.post("/", response_model=CategoryResponse, status_code=201)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.create_category(data=data, db=db, user_id=user_id))


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.update_category(category_id=category_id, data=data, db=db, user_id=user_id))


@router.post("/reorder", status_code=204)
def reorder_categories(
    data: CategoryReorder,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    'Сохраняет порядок категорий среди соседей одного уровня и типа.'
    return operation_response(commands.reorder_categories(data=data, db=db, user_id=user_id))


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    'Удаление каскадно удалит все дочерние (ON DELETE CASCADE на parent_id).'
    return operation_response(commands.delete_category(category_id=category_id, db=db, user_id=user_id))
