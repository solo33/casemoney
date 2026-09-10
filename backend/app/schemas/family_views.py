from app.money import MoneyValue
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


class FamilyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class InviteCreate(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    role: Literal["editor", "viewer"] = "editor"


class MemberRoleUpdate(BaseModel):
    role: Literal["editor", "viewer"]


class AccountAccessItem(BaseModel):
    user_id: int
    permission: Literal["editor", "viewer"]


class AccountAccessUpdate(BaseModel):
    is_shared: bool
    members: list[AccountAccessItem] = []


class SettlementCreate(BaseModel):
    to_user_id: int
    from_account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    amount: MoneyValue = Field(gt=0)
    currency: str = Field(min_length=2, max_length=10)
    date: Optional[datetime] = None
    description: Optional[str] = Field(None, max_length=500)


class FamilyExpenseAccept(BaseModel):
    owner_category_id: int
    owner_account_id: int


class FamilyExpenseAcceptBatchItem(BaseModel):
    id: int
    owner_category_id: int
    owner_account_id: int


class FamilyExpenseAcceptBatch(BaseModel):
    items: list[FamilyExpenseAcceptBatchItem] = Field(min_length=1, max_length=100)


class FamilyAnalyticsExportRequest(BaseModel):
    year: int = Field(ge=2000, le=2200)
    month: int = Field(ge=1, le=12)
