from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class CreditObligation(Base):
    __tablename__ = "credit_obligations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    kind = Column(String(24), nullable=False)  # mortgage, loan, credit_card, private_debt, deposit
    direction = Column(String(16), nullable=False, default="owe")  # owe, receivable
    currency = Column(String(10), nullable=False, default="RUB")
    counterparty = Column(String(160), nullable=True)
    original_amount = Column(Float, nullable=True)
    current_balance = Column(Float, nullable=True)
    credit_limit = Column(Float, nullable=True)
    monthly_payment = Column(Float, nullable=True)
    due_day = Column(Integer, nullable=True)
    statement_day = Column(Integer, nullable=True)
    next_payment_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True)
    reminder_days_before = Column(Integer, nullable=False, default=3)
    source_account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    linked_account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    # Optional initial loan disbursement, separate from the payment account.
    funds_received = Column(Boolean, nullable=False, default=False)
    funds_account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    funding_transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(16), nullable=False, default="active")
    notes = Column(Text, nullable=True)
    last_reminder_for_date = Column(Date, nullable=True)
    last_email_reminder_for_date = Column(Date, nullable=True)
    annual_interest_rate = Column(Float, nullable=True)
    # What should change after an early mortgage repayment.  The actual
    # payment history is never recomputed; this setting only affects the
    # following forecast and, for reduce_payment, the new regular amount.
    early_repayment_mode = Column(String(24), nullable=False, default="reduce_term")
    interest_payout_frequency = Column(String(16), nullable=True)  # monthly, maturity
    capitalization = Column(Boolean, nullable=False, default=False)
    # ``manual`` leaves the next interest payment as a reminder. ``planned``
    # also creates one future income transaction so it is visible in planning
    # reports and calendars without affecting an account balance yet.
    interest_accrual_mode = Column(String(16), nullable=False, default="manual")
    planned_interest_transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    opened_at = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    payments = relationship(
        "CreditPayment",
        back_populates="credit",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CreditPayment(Base):
    __tablename__ = "credit_payments"

    id = Column(Integer, primary_key=True, index=True)
    credit_id = Column(
        Integer,
        ForeignKey("credit_obligations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    amount = Column(Float, nullable=False)
    principal_amount = Column(Float, nullable=True)
    interest_amount = Column(Float, nullable=True)
    # A separate early repayment reduces the principal in full and does not
    # include the regular monthly interest calculation.
    is_early_payment = Column(Boolean, nullable=False, default=False)
    early_repayment_mode = Column(String(24), nullable=True)
    currency = Column(String(10), nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    balance_after = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    credit = relationship("CreditObligation", back_populates="payments")
