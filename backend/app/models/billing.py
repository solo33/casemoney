from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    plan = Column(String(16), nullable=False, default="family")
    status = Column(String(20), nullable=False, default="pending", index=True)
    provider = Column(String(20), nullable=False, default="yookassa")
    provider_payment_method_id = Column(String(128), nullable=True)
    payment_method_title = Column(String(160), nullable=True)
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True, index=True)
    next_charge_at = Column(DateTime(timezone=True), nullable=True, index=True)
    cancel_at_period_end = Column(Boolean, nullable=False, default=False)
    last_payment_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    payments = relationship("BillingPayment", back_populates="subscription", cascade="all, delete-orphan")


class BillingPayment(Base):
    __tablename__ = "billing_payments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False, default="yookassa")
    provider_payment_id = Column(String(128), nullable=True, unique=True, index=True)
    idempotence_key = Column(String(64), nullable=False, unique=True)
    kind = Column(String(16), nullable=False, default="initial")  # initial, renewal
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="RUB")
    status = Column(String(20), nullable=False, default="pending", index=True)
    confirmation_url = Column(Text, nullable=True)
    failure_reason = Column(Text, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    subscription = relationship("Subscription", back_populates="payments")
