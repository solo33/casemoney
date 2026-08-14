from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "category_id", "period", "period_start",
            name="uq_budgets_user_category_period_start",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    period = Column(String(16), nullable=False, default="month")  # month; quarter/year позже
    period_start = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)
    rollover_mode = Column(String(24), nullable=False, default="none")
    include_planned = Column(Boolean, nullable=False, default=False)
    scope = Column(String(16), nullable=False, default="personal")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
