from pydantic import BaseModel
from typing import Optional
from decimal import Decimal


class AccountBase(BaseModel):
    name: str
    type: str          # cash, card, bank, crypto
    currency: str      # USD, EUR, RUB
    balance: Decimal = Decimal("0.00")
    color: Optional[str] = None
    icon: Optional[str] = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    currency: Optional[str] = None
    balance: Optional[Decimal] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class AccountResponse(AccountBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True