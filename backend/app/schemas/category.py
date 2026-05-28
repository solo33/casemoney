from pydantic import BaseModel
from typing import Literal, Optional

CategoryType = Literal["income", "expense"]


class CategoryCreate(BaseModel):
    name: str
    type: CategoryType = "expense"
    color: str = "#6366f1"
    icon: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[CategoryType] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryResponse(BaseModel):
    id: int
    user_id: int
    name: str
    type: CategoryType
    color: str
    icon: Optional[str]
    is_default: bool

    class Config:
        from_attributes = True
