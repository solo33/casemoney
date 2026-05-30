from sqlalchemy import Column, Integer, Boolean, DateTime
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
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
