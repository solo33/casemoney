from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    main_currency = Column(String(10), nullable=False, default="RUB")
    plan = Column(String(16), nullable=False, default="personal")
    plan_source = Column(String(16), nullable=False, default="default")  # default, admin, billing
    plan_expires_at = Column(DateTime(timezone=True), nullable=True)
    family_upgrade_enabled = Column(Boolean, nullable=False, default=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    email_verified = Column(Boolean, nullable=False, default=False)
    verification_email_sent_at = Column(DateTime(timezone=True), nullable=True)
    verification_email_attempts = Column(Integer, nullable=False, default=0)
    # Одноразовая изолированная песочница с публичной кнопки «Демо-вход».
    # Удаляется фоновым воркером через TTL — см. app/services/demo_cleanup.py.
    is_demo = Column(Boolean, nullable=False, default=False, index=True)
