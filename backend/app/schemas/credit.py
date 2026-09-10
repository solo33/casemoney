from app.money import MoneyValue
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


CreditKind = Literal["mortgage", "loan", "credit_card", "private_debt", "deposit"]
CreditDirection = Literal["owe", "receivable"]
InterestPayoutFrequency = Literal["monthly", "maturity"]
InterestAccrualMode = Literal["manual", "planned"]
EarlyRepaymentMode = Literal["reduce_term", "reduce_payment"]


class CreditCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    kind: CreditKind
    direction: CreditDirection = "owe"
    currency: str = Field("RUB", min_length=2, max_length=10)
    counterparty: Optional[str] = Field(None, max_length=160)
    original_amount: Optional[MoneyValue] = Field(None, ge=0)
    current_balance: Optional[MoneyValue] = Field(None, ge=0)
    credit_limit: Optional[MoneyValue] = Field(None, ge=0)
    monthly_payment: Optional[MoneyValue] = Field(None, gt=0)
    annual_interest_rate: Optional[MoneyValue] = Field(None, ge=0, le=100)
    early_repayment_mode: EarlyRepaymentMode = "reduce_term"
    interest_payout_frequency: Optional[InterestPayoutFrequency] = None
    capitalization: bool = False
    interest_accrual_mode: InterestAccrualMode = "manual"
    opened_at: Optional[date] = None
    due_day: Optional[int] = Field(None, ge=1, le=31)
    statement_day: Optional[int] = Field(None, ge=1, le=31)
    next_payment_date: Optional[date] = None
    end_date: Optional[date] = None
    reminder_days_before: int = Field(3, ge=0, le=30)
    source_account_id: Optional[int] = None
    linked_account_id: Optional[int] = None
    funds_received: bool = False
    funds_account_id: Optional[int] = None
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
        if self.funds_received:
            if self.kind in {"deposit", "credit_card"} or self.direction != "owe":
                raise ValueError("Зачисление доступно только для обязательства, по которому вы должны")
            if not self.funds_account_id:
                raise ValueError("Выберите счёт, на который поступили деньги")
            if not (self.original_amount or self.current_balance):
                raise ValueError("Укажите сумму кредита")
        return self


class CreditUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=160)
    counterparty: Optional[str] = Field(None, max_length=160)
    original_amount: Optional[MoneyValue] = Field(None, ge=0)
    current_balance: Optional[MoneyValue] = Field(None, ge=0)
    credit_limit: Optional[MoneyValue] = Field(None, ge=0)
    monthly_payment: Optional[MoneyValue] = Field(None, gt=0)
    annual_interest_rate: Optional[MoneyValue] = Field(None, ge=0, le=100)
    early_repayment_mode: Optional[EarlyRepaymentMode] = None
    interest_payout_frequency: Optional[InterestPayoutFrequency] = None
    capitalization: Optional[bool] = None
    interest_accrual_mode: Optional[InterestAccrualMode] = None
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
    amount: MoneyValue = Field(gt=0)
    account_id: int
    paid_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=500)
    is_early_payment: bool = False
    early_repayment_mode: Optional[EarlyRepaymentMode] = None


class MortgagePaymentPreview(BaseModel):
    principal_amount: MoneyValue
    interest_amount: MoneyValue
    currency: str


class CreditPaymentResponse(BaseModel):
    id: int
    transaction_id: Optional[int]
    amount: MoneyValue
    principal_amount: Optional[MoneyValue]
    interest_amount: Optional[MoneyValue]
    currency: str
    paid_at: datetime
    account_id: Optional[int]
    balance_after: Optional[MoneyValue]
    notes: Optional[str]
    is_early_payment: bool = False
    early_repayment_mode: Optional[str] = None

    class Config:
        from_attributes = True


class CreditResponse(BaseModel):
    id: int
    name: str
    kind: str
    direction: str
    currency: str
    counterparty: Optional[str]
    original_amount: Optional[MoneyValue]
    current_balance: Optional[MoneyValue]
    credit_limit: Optional[MoneyValue]
    monthly_payment: Optional[MoneyValue]
    annual_interest_rate: Optional[MoneyValue]
    early_repayment_mode: str
    interest_payout_frequency: Optional[str]
    capitalization: bool
    interest_accrual_mode: str
    planned_interest_transaction_id: Optional[int]
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
    funds_received: bool
    funds_account_id: Optional[int]
    funds_account_name: Optional[str]
    funding_transaction_id: Optional[int]
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


class MortgageScheduleItem(BaseModel):
    payment_date: date
    payment_amount: MoneyValue
    principal_amount: MoneyValue
    interest_amount: MoneyValue
    balance_after: MoneyValue


class MortgageScheduleResponse(BaseModel):
    credit_id: int
    currency: str
    monthly_payment: MoneyValue
    early_repayment_mode: str
    items: list[MortgageScheduleItem]
