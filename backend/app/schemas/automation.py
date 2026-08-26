from typing import List, Optional

from pydantic import BaseModel, Field


class AutomationSettings(BaseModel):
    rules_enabled: bool = True
    duplicates_enabled: bool = True


class AutomationSettingsUpdate(BaseModel):
    rules_enabled: Optional[bool] = None
    duplicates_enabled: Optional[bool] = None


class CategoryRuleCreate(BaseModel):
    pattern: str = Field(min_length=2, max_length=160)
    category_id: int


class CategoryRuleResponse(BaseModel):
    id: int
    pattern: str
    category_id: int
    category_name: str
    category_type: str
    is_active: bool


class DuplicateTransactionItem(BaseModel):
    id: int
    date: str
    amount: float
    currency: str
    description: Optional[str] = None
    account_name: str


class DuplicateGroupResponse(BaseModel):
    key: str
    transactions: List[DuplicateTransactionItem]


class RegularPaymentSuggestion(BaseModel):
    """A non-binding recurring-payment candidate built from past operations."""
    key: str
    transaction_type: str
    description: str
    account_id: int
    account_name: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    amount: float
    currency: str
    cadence: str
    occurrences: int
    last_date: str
    next_date: str
