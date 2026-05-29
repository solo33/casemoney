from pydantic import BaseModel, Field
from typing import Optional, List


# --- AccountBalance ---

class AccountBalanceResponse(BaseModel):
    currency: str
    balance: float
    balance_in_main: float  # эквивалент в main_currency пользователя

    class Config:
        from_attributes = True


class AccountBalanceCreate(BaseModel):
    currency: str = Field(..., min_length=2, max_length=10)
    balance: float = 0.0


class AccountBalanceUpdate(BaseModel):
    balance: float


# --- Account ---

class AccountBase(BaseModel):
    name: str
    type: str          # cash, card, bank, crypto
    color: Optional[str] = None
    icon: Optional[str] = None
    group_id: Optional[int] = None


class AccountCreate(AccountBase):
    # Начальная валюта и баланс — создаются первая запись AccountBalance
    initial_currency: str = Field("RUB", min_length=2, max_length=10)
    initial_balance: float = 0.0


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    group_id: Optional[int] = None  # передать null чтобы вынести из группы


class AccountResponse(AccountBase):
    id: int
    user_id: int
    balances: List[AccountBalanceResponse] = []
    total_in_main: float = 0.0  # сумма всех балансов в main_currency пользователя

    class Config:
        from_attributes = True


# --- Grouped response ---

class GroupSummary(BaseModel):
    id: Optional[int]  # None для виртуальной группы "Без группы"
    name: str
    sort_order: int


class AccountGroupBucket(BaseModel):
    group: GroupSummary
    accounts: List[AccountResponse]
    total_in_main: float  # сумма total_in_main всех счетов в группе
