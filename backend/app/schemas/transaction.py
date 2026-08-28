from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.tag import TagResponse


class TransactionCreate(BaseModel):
    amount: float
    type: str  # income, expense, transfer
    currency: Optional[str] = Field(None, min_length=2, max_length=10)  # default — первая валюта счёта
    description: Optional[str] = None
    date: Optional[datetime] = None
    account_id: int
    category_id: Optional[int] = None
    # Перевод: счёт-получатель и сумма зачисления (необязательно — вычислим по курсу)
    to_account_id: Optional[int] = None
    to_amount: Optional[float] = None
    to_currency: Optional[str] = Field(None, min_length=2, max_length=10)
    fee_amount: Optional[float] = Field(None, ge=0)
    fee_category_id: Optional[int] = None
    is_family_expense: bool = False
    reimbursement_amount: Optional[float] = Field(None, ge=0)
    is_planned: bool = False
    tag_ids: list[int] = Field(default_factory=list, max_length=20)


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    currency: Optional[str] = Field(None, min_length=2, max_length=10)
    description: Optional[str] = None
    date: Optional[datetime] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    to_account_id: Optional[int] = None
    to_amount: Optional[float] = None
    to_currency: Optional[str] = Field(None, min_length=2, max_length=10)
    fee_amount: Optional[float] = Field(None, ge=0)
    fee_category_id: Optional[int] = None
    is_family_expense: Optional[bool] = None
    reimbursement_amount: Optional[float] = Field(None, ge=0)
    is_planned: Optional[bool] = None
    tag_ids: Optional[list[int]] = Field(None, max_length=20)


class TransactionBulkCategoryUpdate(BaseModel):
    """One deliberate category change for several historic income/expense rows."""
    transaction_ids: list[int] = Field(min_length=1, max_length=100)
    category_id: Optional[int] = None


class TransactionBulkUpdateResult(BaseModel):
    updated: int


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
    to_account_id: Optional[int] = None
    to_amount: Optional[float] = None
    to_currency: Optional[str] = None
    fee_amount: Optional[float] = None
    fee_category_id: Optional[int] = None
    family_id: Optional[int] = None
    is_family_expense: bool = False
    reimbursement_amount: float = 0
    is_planned: bool = False
    tags: list[TagResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True
