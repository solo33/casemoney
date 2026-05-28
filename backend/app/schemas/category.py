from pydantic import BaseModel
from typing import Literal, Optional, List

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
    parent_id: Optional[int] = None  # передать null чтобы сделать корневой


class CategoryResponse(BaseModel):
    id: int
    user_id: int
    name: str
    type: CategoryType
    color: str
    icon: Optional[str]
    is_default: bool
    parent_id: Optional[int]

    class Config:
        from_attributes = True


class CategoryTreeNode(BaseModel):
    id: int
    name: str
    type: CategoryType
    color: str
    icon: Optional[str]
    is_default: bool
    parent_id: Optional[int]
    children: List["CategoryTreeNode"] = []

    class Config:
        from_attributes = True


CategoryTreeNode.model_rebuild()
