from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class TransactionCreate(BaseModel):
    amount: float
    type: str  # income, expense, transfer
    currency: Optional[str] = Field(None, min_length=2, max_length=10)  # default — первая валюта счёта
    description: Optional[str] = None
    date: Optional[datetime] = None
    account_id: int
    category_id: Optional[int] = None


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    currency: Optional[str] = Field(None, min_length=2, max_length=10)
    description: Optional[str] = None
    date: Optional[datetime] = None
    category_id: Optional[int] = None


class TransactionResponse(BaseModel):
    id: int
    amount: float
    currency: str
    type: str
    description: Optional[str]
    date: datetime
    account_id: int
    category_id: Optional[int]
    user_id: int

    class Config:
        from_attributes = True
