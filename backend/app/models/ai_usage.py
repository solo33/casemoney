from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class AiUsage(Base):
    """Per-user persisted AI quota; prompt content is intentionally never stored."""

    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "period_key", name="uq_ai_usage_user_period"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    period_key = Column(String(7), nullable=False)  # YYYY-MM
    request_count = Column(Integer, nullable=False, default=0)
    last_requested_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
