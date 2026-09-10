from app.money import MoneyValue
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ShoppingListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    is_shared: bool = False


class ShoppingListUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    is_default: Optional[bool] = None


class ShoppingListResponse(BaseModel):
    id: int
    name: str
    is_default: bool
    family_id: Optional[int] = None
    is_shared: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ShoppingItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    quantity: MoneyValue = Field(1, gt=0, le=100000)
    unit: Optional[str] = Field(None, max_length=24)
    planned_price: Optional[MoneyValue] = Field(None, ge=0)
    actual_price: Optional[MoneyValue] = Field(None, ge=0)
    currency: str = Field("RUB", min_length=2, max_length=10)
    category_id: Optional[int] = None
    note: Optional[str] = Field(None, max_length=500)


class ShoppingItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    quantity: Optional[MoneyValue] = Field(None, gt=0, le=100000)
    unit: Optional[str] = Field(None, max_length=24)
    planned_price: Optional[MoneyValue] = Field(None, ge=0)
    actual_price: Optional[MoneyValue] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=2, max_length=10)
    category_id: Optional[int] = None
    transaction_id: Optional[int] = None
    note: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = Field(None, pattern="^(planned|bought)$")


class ShoppingItemResponse(BaseModel):
    id: int
    list_id: int
    name: str
    quantity: MoneyValue
    unit: Optional[str]
    planned_price: Optional[MoneyValue]
    actual_price: Optional[MoneyValue]
    currency: str
    category_id: Optional[int]
    transaction_id: Optional[int]
    status: str
    note: Optional[str]
    purchased_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ShoppingSuggestion(BaseModel):
    name: str
    quantity: MoneyValue
    unit: Optional[str]
    planned_price: Optional[MoneyValue]
    currency: str
    category_id: Optional[int]
    used_count: int
