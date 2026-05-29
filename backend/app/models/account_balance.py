from sqlalchemy import Column, Integer, String, Float, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from app.database import Base


class AccountBalance(Base):
    """Баланс счёта в конкретной валюте. У одного счёта может быть несколько балансов."""
    __tablename__ = "account_balances"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    currency = Column(String(10), nullable=False)
    balance = Column(Float, nullable=False, default=0.0)

    account = relationship("Account", back_populates="balances")

    __table_args__ = (
        UniqueConstraint("account_id", "currency", name="uq_account_currency"),
        Index("ix_account_balances_account_id", "account_id"),
    )
