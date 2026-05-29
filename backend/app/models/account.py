from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, default="cash")        # cash, card, bank, crypto
    balance = Column(Float, default=0.0)
    currency = Column(String, default="RUB")
    color = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Группа счетов (опционально). NULL = "Без группы"
    group_id = Column(Integer, ForeignKey("account_groups.id", ondelete="SET NULL"), nullable=True)

    transactions = relationship("Transaction", back_populates="account")
    group = relationship("AccountGroup", back_populates="accounts")
