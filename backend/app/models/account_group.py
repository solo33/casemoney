from sqlalchemy import Column, Integer, String, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base


class AccountGroup(Base):
    __tablename__ = "account_groups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    accounts = relationship("Account", back_populates="group")

    __table_args__ = (
        Index("ix_account_groups_user_sort", "user_id", "sort_order"),
    )
