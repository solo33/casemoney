from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    owner_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (
        UniqueConstraint("family_id", "email", name="uq_family_members_family_email"),
    )

    id = Column(Integer, primary_key=True)
    family_id = Column(
        Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="member")
    status = Column(String(20), nullable=False, default="pending")
    invited_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)


class FamilySettlement(Base):
    __tablename__ = "family_settlements"

    id = Column(Integer, primary_key=True)
    family_id = Column(
        Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    from_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    to_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)
    date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    description = Column(String(500), nullable=True)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
