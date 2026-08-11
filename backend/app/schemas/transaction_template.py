from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TransactionTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str
    amount: float = Field(gt=0)
    currency: str = Field(min_length=2, max_length=10)
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)


class TransactionTemplateResponse(TransactionTemplateCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
