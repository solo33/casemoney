from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)        # "Наличные", "Карта Сбер"
    balance = Column(Float, default=0.0)         # текущий баланс
    currency = Column(String, default="RUB")     # валюта
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transactions = relationship("Transaction", back_populates="account")