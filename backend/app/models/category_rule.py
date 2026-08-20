from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base


class CategoryRule(Base):
    """A personal, transparent rule for classifying a transaction by its note."""

    __tablename__ = "category_rules"
    __table_args__ = (
        UniqueConstraint("user_id", "pattern", name="uq_category_rules_user_pattern"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    # A normalized lower-case phrase; it is deliberately simple and reviewable.
    pattern = Column(String(160), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
