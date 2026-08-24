from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class PlanResponse(BaseModel):
    code: Literal["personal", "family"]
    name: str
    price: Optional[float] = None
    currency: str = "RUB"
    period: Optional[str] = None
    current: bool = False


class BillingPaymentResponse(BaseModel):
    id: int
    kind: str
    amount: float
    currency: str
    status: str
    paid_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    provider: str
    status: str
    current_period_end: Optional[datetime]
    next_charge_at: Optional[datetime]
    cancel_at_period_end: bool
    payment_method_title: Optional[str]

    class Config:
        from_attributes = True


class BillingOverview(BaseModel):
    configured: bool
    plan: str
    plan_source: str
    plan_expires_at: Optional[datetime]
    family_price: float
    currency: str = "RUB"
    subscription: Optional[SubscriptionResponse]
    payments: list[BillingPaymentResponse]
    family_upgrade_enabled: bool
    billing_enabled: bool
    test_mode: bool = True
    trial_days: int = 7
    test_month_price: float
    test_year_price: float


class CheckoutResponse(BaseModel):
    payment_id: int
    confirmation_url: str


class CheckoutRequest(BaseModel):
    accept_recurring: bool


class TestFamilyCheckoutRequest(BaseModel):
    period: Literal["trial", "month", "year"]
    acknowledge_family_data_cleanup: bool = False
    accept_test_payment: bool = False


class BillingActionResponse(BaseModel):
    status: str
