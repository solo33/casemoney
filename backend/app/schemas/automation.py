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
