from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base
from app.models.transaction import TransactionType
from sqlalchemy import Enum


class RecurringTransaction(Base):
    __tablename__ = "recurring_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    type = Column(Enum(TransactionType), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    description = Column(String(500), nullable=True)
    # Family schedules are created from a confirmed suggestion in the Family
    # report.  The generated planned transaction keeps the same visibility
    # rules as the original shared expense.
    family_id = Column(Integer, ForeignKey("families.id", ondelete="SET NULL"), nullable=True, index=True)
    is_family_expense = Column(Boolean, nullable=False, default=False)
    reimbursement_amount = Column(Float, nullable=False, default=0)
    suggestion_fingerprint = Column(String(64), nullable=True, index=True)
    frequency = Column(String(16), nullable=False, default="monthly")
    # ``custom`` uses custom_interval_days; the standard values remain backward compatible.
    custom_interval_days = Column(Integer, nullable=True)
    # A schedule can either create a reviewable draft or immediately affect the account.
    execution_mode = Column(String(16), nullable=False, default="planned")
    reminder_days = Column(Integer, nullable=False, default=0)
    end_date = Column(Date, nullable=True)
    next_date = Column(Date, nullable=False, index=True)
    last_generated_for = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class RecurringTransactionRun(Base):
    """Immutable audit trail for a scheduled occurrence.

    It lets a person skip an occurrence without deleting the whole schedule and
    protects the worker from producing a duplicate after a restart.
    """
    __tablename__ = "recurring_transaction_runs"
    __table_args__ = (
        UniqueConstraint("recurring_transaction_id", "scheduled_for", name="uq_recurring_run_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    recurring_transaction_id = Column(Integer, ForeignKey("recurring_transactions.id", ondelete="CASCADE"), nullable=False, index=True)
    scheduled_for = Column(Date, nullable=False, index=True)
    status = Column(String(16), nullable=False)  # planned | posted | skipped
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
