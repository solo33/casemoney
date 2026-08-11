from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, default="cash")        # cash, card, bank, crypto
    color = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Группа счетов (опционально). NULL = "Без группы"
    group_id = Column(Integer, ForeignKey("account_groups.id", ondelete="SET NULL"), nullable=True)

    # Порядок счёта внутри своей группы (для drag-сортировки)
    sort_order = Column(Integer, nullable=False, default=0)

    # Учитывать ли в общем балансе. По умолчанию TRUE.
    # Если FALSE — счёт виден, но не суммируется в total_balance дашборда/группы.
    include_in_balance = Column(Boolean, nullable=False, default=True)

    # Показывать ли счёт в формах создания записей. Настройка независима от
    # общего баланса, но для новых счетов по умолчанию повторяет его значение.
    show_for_entries = Column(Boolean, nullable=False, default=True)

    # Свободная заметка: например последние цифры карты или назначение счёта.
    note = Column(Text, nullable=True)

    transactions = relationship(
        "Transaction",
        foreign_keys="Transaction.account_id",
        back_populates="account",
    )
    group = relationship("AccountGroup", back_populates="accounts")
    balances = relationship(
        "AccountBalance",
        back_populates="account",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
