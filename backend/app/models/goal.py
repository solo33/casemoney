from app.money import Money
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Date, Boolean, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

goal_accounts = Table(
    "goal_accounts", Base.metadata,
    Column("goal_id", Integer, ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True),
    Column("account_id", Integer, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True),
)


class Goal(Base):
    """Финансовая цель (например 'Резервный фонд 3 000 000 RUB').

    Текущее значение прогресса можно либо привязать к счетам (сумма текущих остатков),
    либо хранить вручную через current_amount.
    """
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(128), nullable=False)
    icon = Column(String(16), nullable=True)
    target_amount = Column(Money, nullable=False)
    currency = Column(String(10), nullable=False, default="RUB")
    current_amount = Column(Money, nullable=False, default=0)  # ручное значение
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)  # совместимость со старыми клиентами: первый привязанный счёт
    accounts = relationship("Account", secondary=goal_accounts, order_by="Account.id", passive_deletes=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=True, index=True)
    due_date = Column(Date, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    # Архив не удаляет историю взносов и позволяет вернуть цель в работу.
    is_archived = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GoalContribution(Base):
    __tablename__ = "goal_contributions"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Money, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
