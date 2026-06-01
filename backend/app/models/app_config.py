from sqlalchemy import Column, Integer, Boolean, DateTime, String
from sqlalchemy.sql import func
from app.database import Base


class AppConfig(Base):
    """Single-row глобальная конфигурация приложения.

    Всегда существует ровно одна запись с id=1.
    Дополнительные настройки добавляются как новые колонки.
    """
    __tablename__ = "app_config"

    id = Column(Integer, primary_key=True)  # фиксированно 1
    # Требовать ли подтверждение email при регистрации
    require_email_verification = Column(Boolean, nullable=False, default=True)
    # С каким тарифом стартует новый пользователь: "free" или "premium"
    default_plan = Column(String(10), nullable=False, default="free")
    # Если стартовый тариф premium — на сколько дней давать (0 = бессрочно)
    default_premium_days = Column(Integer, nullable=False, default=0)
    # Открыта ли регистрация. Если FALSE — регистрация недоступна.
    registration_enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
