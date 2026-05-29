from sqlalchemy import Column, String, Float, DateTime
from sqlalchemy.sql import func
from app.database import Base


class ExchangeRate(Base):
    """Кэш курса конверсии: 1 unit of from_currency = rate * to_currency."""
    __tablename__ = "exchange_rates"

    from_currency = Column(String(10), primary_key=True)
    to_currency = Column(String(10), primary_key=True)
    rate = Column(Float, nullable=False)
    source = Column(String(20), nullable=False)  # 'cbr' | 'coingecko' | 'derived'
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
