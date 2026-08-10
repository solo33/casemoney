from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


CreditKind = Literal["mortgage", "loan", "credit_card", "private_debt", "deposit"]
CreditDirection = Literal["owe", "receivable"]
InterestPayoutFrequency = Literal["monthly", "maturity"]


class CreditCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    kind: CreditKind
    direction: CreditDirection = "owe"
    currency: str = Field("RUB", min_length=2, max_length=10)
    counterparty: Optional[str] = Field(None, max_length=160)
    original_amount: Optional[float] = Field(None, ge=0)
    current_balance: Optional[float] = Field(None, ge=0)
    credit_limit: Optional[float] = Field(None, ge=0)
    monthly_payment: Optional[float] = Field(None, gt=0)
    annual_interest_rate: Optional[float] = Field(None, ge=0, le=100)
    interest_payout_frequency: Optional[InterestPayoutFrequency] = None
    capitalization: bool = False
    opened_at: Optional[date] = None
    due_day: Optional[int] = Field(None, ge=1, le=31)
    statement_day: Optional[int] = Field(None, ge=1, le=31)
    next_payment_date: Optional[date] = None
    end_date: Optional[date] = None
    reminder_days_before: int = Field(3, ge=0, le=30)
    source_account_id: Optional[int] = None
    linked_account_id: Optional[int] = None
    category_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def validate_credit(self):
        if self.kind == "deposit":
            self.direction = "receivable"
        elif self.kind != "private_debt" and self.direction == "receivable":
            raise ValueError("Только частный заём может быть долгом в вашу пользу")
        if self.kind == "credit_card" and not self.linked_account_id:
            raise ValueError("Для кредитной карты выберите её счёт")
        if self.current_balance is None:
            self.current_balance = self.original_amount
        return self


class CreditUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=160)
    counterparty: Optional[str] = Field(None, max_length=160)
    original_amount: Optional[float] = Field(None, ge=0)
    current_balance: Optional[float] = Field(None, ge=0)
    credit_limit: Optional[float] = Field(None, ge=0)
    monthly_payment: Optional[float] = Field(None, gt=0)
    annual_interest_rate: Optional[float] = Field(None, ge=0, le=100)
    interest_payout_frequency: Optional[InterestPayoutFrequency] = None
    capitalization: Optional[bool] = None
    opened_at: Optional[date] = None
    due_day: Optional[int] = Field(None, ge=1, le=31)
    statement_day: Optional[int] = Field(None, ge=1, le=31)
    next_payment_date: Optional[date] = None
    end_date: Optional[date] = None
    reminder_days_before: Optional[int] = Field(None, ge=0, le=30)
    source_account_id: Optional[int] = None
    linked_account_id: Optional[int] = None
    category_id: Optional[int] = None
    status: Optional[Literal["active", "closed"]] = None
    notes: Optional[str] = Field(None, max_length=2000)


class CreditPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    account_id: int
    paid_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=500)


class CreditPaymentResponse(BaseModel):
    id: int
    transaction_id: Optional[int]
    amount: float
    currency: str
    paid_at: datetime
    account_id: Optional[int]
    balance_after: Optional[float]
    notes: Optional[str]

    class Config:
        from_attributes = True


class CreditResponse(BaseModel):
    id: int
    name: str
    kind: str
    direction: str
    currency: str
    counterparty: Optional[str]
    original_amount: Optional[float]
    current_balance: Optional[float]
    credit_limit: Optional[float]
    monthly_payment: Optional[float]
    annual_interest_rate: Optional[float]
    interest_payout_frequency: Optional[str]
    capitalization: bool
    opened_at: Optional[date]
    due_day: Optional[int]
    statement_day: Optional[int]
    next_payment_date: Optional[date]
    end_date: Optional[date]
    reminder_days_before: int
    source_account_id: Optional[int]
    source_account_name: Optional[str]
    linked_account_id: Optional[int]
    linked_account_name: Optional[str]
    category_id: Optional[int]
    category_name: Optional[str]
    status: str
    notes: Optional[str]
    days_until_payment: Optional[int]
    is_overdue: bool
    payments: list[CreditPaymentResponse] = []


class CreditSummary(BaseModel):
    total_active: int
    overdue_count: int
    upcoming: list[CreditResponse]
