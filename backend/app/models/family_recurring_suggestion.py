from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class FamilyRecurringSuggestionDecision(Base):
    """A persisted answer to a detected shared-payment pattern.

    Suggestions are recalculated from the user's own family operations.  This
    compact record prevents a declined pattern from returning on another
    device and prevents a confirmed pattern from being created twice.
    """

    __tablename__ = "family_recurring_suggestion_decisions"
    __table_args__ = (
        UniqueConstraint(
            "family_id", "fingerprint", name="uq_family_recurring_suggestion_decisions_family_fingerprint"
        ),
    )

    id = Column(Integer, primary_key=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    fingerprint = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False)  # created | dismissed
    decided_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
