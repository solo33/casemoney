from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, UniqueConstraint
from app.database import Base


class UserCurrency(Base):
    """Список валют пользователя с настройками отображения и опционально ручным курсом.

    auto=True (по умолчанию) → курс берётся из exchange_rates (CBR / CoinGecko)
    auto=False → используется manual_rate как 1 currency = manual_rate * main_currency
    """
    __tablename__ = "user_currencies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    currency = Column(String(10), nullable=False)            # ISO код (RUB, USD, BTC, ...)
    display_name = Column(String(64), nullable=True)         # "Доллар США"
    short_code = Column(String(10), nullable=True)           # отображаемое сокращение, default = currency
    manual_rate = Column(Float, nullable=True)               # 1 unit = manual_rate * main_currency
    auto = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("user_id", "currency", name="uq_user_currency"),
    )
