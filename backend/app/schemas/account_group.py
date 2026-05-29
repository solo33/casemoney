from pydantic import BaseModel
from typing import Optional


class AccountGroupCreate(BaseModel):
    name: str
    sort_order: int = 0


class AccountGroupUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class AccountGroupResponse(BaseModel):
    id: int
    user_id: int
    name: str
    sort_order: int

    class Config:
        from_attributes = True
