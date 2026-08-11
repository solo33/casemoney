from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date
from sqlalchemy.sql import func
from app.database import Base


class Goal(Base):
    """Финансовая цель (например 'Резервный фонд 3 000 000 RUB').

    Текущее значение прогресса можно либо привязать к счёту (live баланс),
    либо хранить вручную через current_amount.
    """
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(128), nullable=False)
    icon = Column(String(16), nullable=True)
    target_amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="RUB")
    current_amount = Column(Float, nullable=False, default=0.0)  # ручное значение
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)  # если задан — прогресс берётся из баланса счёта
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=True, index=True)
    due_date = Column(Date, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GoalContribution(Base):
    __tablename__ = "goal_contributions"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
