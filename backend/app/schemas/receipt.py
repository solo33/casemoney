from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReceiptUpdate(BaseModel):
    merchant: Optional[str] = Field(None, max_length=255)
    receipt_date: Optional[date] = None
    total_amount: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=2, max_length=10)
    note: Optional[str] = Field(None, max_length=4000)
    transaction_id: Optional[int] = None


class ReceiptItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    quantity: Optional[float] = Field(None, gt=0, le=100000)
    unit_price: Optional[float] = Field(None, ge=0)
    total_amount: Optional[float] = Field(None, ge=0)
    category_id: Optional[int] = None


class ReceiptItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    quantity: Optional[float] = Field(None, gt=0, le=100000)
    unit_price: Optional[float] = Field(None, ge=0)
    total_amount: Optional[float] = Field(None, ge=0)
    category_id: Optional[int] = None
    sort_order: Optional[int] = Field(None, ge=0)


class ReceiptItemResponse(BaseModel):
    id: int
    receipt_id: int
    name: str
    quantity: Optional[float]
    unit_price: Optional[float]
    total_amount: Optional[float]
    category_id: Optional[int]
    sort_order: int

    class Config:
        from_attributes = True


class ReceiptResponse(BaseModel):
    id: int
    transaction_id: Optional[int]
    merchant: Optional[str]
    receipt_date: Optional[date]
    total_amount: Optional[float]
    currency: str
    note: Optional[str]
    original_filename: str
    content_type: Optional[str]
    file_size: int
    created_at: datetime
    updated_at: datetime
    items: list[ReceiptItemResponse] = []

    class Config:
        from_attributes = True
