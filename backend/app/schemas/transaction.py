from app.money import MoneyValue
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.tag import TagResponse


class TransactionCreate(BaseModel):
    amount: MoneyValue
    type: str  # income, expense, transfer
    currency: Optional[str] = Field(None, min_length=2, max_length=10)  # default — первая валюта счёта
    description: Optional[str] = None
    date: Optional[datetime] = None
    account_id: int
    category_id: Optional[int] = None
    # Перевод: счёт-получатель и сумма зачисления (необязательно — вычислим по курсу)
    to_account_id: Optional[int] = None
    to_amount: Optional[MoneyValue] = None
    to_currency: Optional[str] = Field(None, min_length=2, max_length=10)
    fee_amount: Optional[MoneyValue] = Field(None, ge=0)
    fee_category_id: Optional[int] = None
    is_family_expense: bool = False
    reimbursement_amount: Optional[MoneyValue] = Field(None, ge=0)
    is_planned: bool = False
    tag_ids: list[int] = Field(default_factory=list, max_length=20)


class TransactionUpdate(BaseModel):
    amount: Optional[MoneyValue] = None
    type: Optional[str] = None
    currency: Optional[str] = Field(None, min_length=2, max_length=10)
    description: Optional[str] = None
    date: Optional[datetime] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    to_account_id: Optional[int] = None
    to_amount: Optional[MoneyValue] = None
    to_currency: Optional[str] = Field(None, min_length=2, max_length=10)
    fee_amount: Optional[MoneyValue] = Field(None, ge=0)
    fee_category_id: Optional[int] = None
    is_family_expense: Optional[bool] = None
    reimbursement_amount: Optional[MoneyValue] = Field(None, ge=0)
    is_planned: Optional[bool] = None
    tag_ids: Optional[list[int]] = Field(None, max_length=20)


class TransactionBulkCategoryUpdate(BaseModel):
    """One deliberate category change for several historic income/expense rows."""
    transaction_ids: list[int] = Field(min_length=1, max_length=100)
    category_id: Optional[int] = None


class TransactionBulkUpdateResult(BaseModel):
    updated: int


class TransferSuggestion(BaseModel):
    """A possible manually-created transfer; never applied automatically."""

    expense_id: int
    income_id: int
    date: datetime
    income_date: datetime
    account_id: int
    account_name: str
    to_account_id: int
    to_account_name: str
    amount: MoneyValue
    currency: str
    to_amount: MoneyValue
    to_currency: str
    fee_amount: Optional[MoneyValue] = None
    confidence: MoneyValue = Field(ge=0, le=1)


class TransferMatchConfirm(BaseModel):
    """The user explicitly approves one proposed expense/income pair."""

    income_transaction_id: int
    fee_category_id: Optional[int] = None


class TransactionResponse(BaseModel):
    id: int
    amount: MoneyValue
    currency: str
    type: str
    description: Optional[str]
    date: datetime
    account_id: int
    category_id: Optional[int]
    user_id: int
    to_account_id: Optional[int] = None
    to_amount: Optional[MoneyValue] = None
    to_currency: Optional[str] = None
    fee_amount: Optional[MoneyValue] = None
    fee_category_id: Optional[int] = None
    family_id: Optional[int] = None
    is_family_expense: bool = False
    reimbursement_amount: MoneyValue = Field(default=0, json_schema_extra={"default": 0})
    is_planned: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    tags: list[TagResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True
