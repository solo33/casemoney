from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.database import Base


class TransactionHistory(Base):
    """Журнал изменений операций: создание / редактирование / удаление.

    Денормализованный снимок (имена счёта и категории сохраняются строкой),
    чтобы запись истории оставалась читаемой даже после удаления операции.
    """
    __tablename__ = "transaction_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    # Не FK — чтобы запись истории пережила удаление самой операции
    transaction_id = Column(Integer, nullable=True)

    action = Column(String(10), nullable=False)   # created | edited | deleted
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    op_date = Column(DateTime(timezone=True), nullable=True)  # дата самой операции
    type = Column(String(10), nullable=False)                # income | expense | transfer
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)
    account_name = Column(String, nullable=True)
    category_name = Column(String, nullable=True)            # путь "Родитель\Дочерняя"
    description = Column(String, nullable=True)

    # Для action=edited — значения до изменения (для показа «было → стало»)
    prev_amount = Column(Float, nullable=True)
    prev_currency = Column(String(10), nullable=True)
