from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class PendingRegistration(Base):
    """Заявка на регистрацию, ожидающая подтверждения кодом из письма.

    Реальный пользователь (users) создаётся только после ввода верного кода.
    На один email — одна активная заявка (email уникален).
    """
    __tablename__ = "pending_registrations"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)

    code = Column(String(6), nullable=False)            # 6-значный числовой код
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)        # попытки ввода кода
    last_sent_at = Column(DateTime(timezone=True), nullable=False)  # для кулдауна
    created_at = Column(DateTime(timezone=True), server_default=func.now())
