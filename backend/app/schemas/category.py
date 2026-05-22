from pydantic import BaseModel

class CategoryCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    icon: str | None = None

class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None

class CategoryResponse(BaseModel):
    id: int
    user_id: int
    name: str
    color: str
    icon: str | None
    is_default: bool

    class Config:
        from_attributes = True