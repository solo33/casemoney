from typing import List, Literal, Optional

from pydantic import BaseModel


CategoryType = Literal["income", "expense"]


class CategoryCreate(BaseModel):
    name: str
    type: CategoryType = "expense"
    color: str = "#6366f1"
    icon: Optional[str] = None
    parent_id: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[CategoryType] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_hidden: Optional[bool] = None
    parent_id: Optional[int] = None


class CategoryResponse(BaseModel):
    id: int
    user_id: int
    name: str
    type: CategoryType
    color: str
    icon: Optional[str]
    is_default: bool
    is_hidden: bool
    parent_id: Optional[int]
    sort_order: int

    class Config:
        from_attributes = True


class CategoryTreeNode(BaseModel):
    id: int
    name: str
    type: CategoryType
    color: str
    icon: Optional[str]
    is_default: bool
    is_hidden: bool
    parent_id: Optional[int]
    sort_order: int
    children: List["CategoryTreeNode"] = []

    class Config:
        from_attributes = True


CategoryTreeNode.model_rebuild()


class CategoryReorder(BaseModel):
    category_ids: List[int]
    parent_id: Optional[int] = None
