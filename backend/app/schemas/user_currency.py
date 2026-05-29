from pydantic import BaseModel, Field
from typing import Optional, List


class UserCurrencyBase(BaseModel):
    display_name: Optional[str] = None
    short_code: Optional[str] = None
    manual_rate: Optional[float] = None
    auto: bool = True


class UserCurrencyCreate(BaseModel):
    currency: str = Field(..., min_length=2, max_length=10)
    display_name: Optional[str] = None
    short_code: Optional[str] = None
    manual_rate: Optional[float] = None
    auto: bool = True


class UserCurrencyUpdate(BaseModel):
    display_name: Optional[str] = None
    short_code: Optional[str] = None
    manual_rate: Optional[float] = None
    auto: Optional[bool] = None


class UserCurrencyResponse(BaseModel):
    id: int
    currency: str           # ISO
    display_name: Optional[str]
    short_code: Optional[str]
    manual_rate: Optional[float]   # как сохранено (может быть null)
    auto: bool
    effective_rate: float          # текущий курс к main_currency (auto или manual)
    rate_source: str               # "auto" | "manual"

    class Config:
        from_attributes = True


class CurrenciesResponse(BaseModel):
    main_currency: str
    currencies: List[UserCurrencyResponse]
