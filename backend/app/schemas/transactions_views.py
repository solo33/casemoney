from app.money import MoneyValue
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.schemas.transaction import TransactionResponse


class TransactionsPage(BaseModel):
    items: List[TransactionResponse]
    total: int
    limit: int
    offset: int


class HistoryItem(BaseModel):
    id: int
    transaction_id: Optional[int]
    action: str
    changed_at: datetime
    op_date: Optional[datetime]
    type: str
    amount: MoneyValue
    currency: str
    account_name: Optional[str]
    category_name: Optional[str]
    description: Optional[str]
    prev_amount: Optional[MoneyValue]
    prev_currency: Optional[str]

    class Config:
        from_attributes = True


class HistoryPage(BaseModel):
    items: List[HistoryItem]
    total: int
    limit: int
    offset: int
