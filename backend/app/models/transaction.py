from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TransactionType(enum.Enum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)  # валюта транзакции — определяет, какой balance счёта меняется
    type = Column(Enum(TransactionType), nullable=False)
    description = Column(String, nullable=True)
    date = Column(DateTime(timezone=True), server_default=func.now())

    # Технические метки: когда запись создана / последний раз изменена.
    # updated_at обновляется автоматически при любом изменении строки (onupdate).
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Для переводов: счёт-получатель и сумма зачисления (в его валюте).
    # У income/expense эти поля NULL.
    to_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    to_amount = Column(Float, nullable=True)
    to_currency = Column(String(10), nullable=True)

    account = relationship("Account", foreign_keys=[account_id], back_populates="transactions")
