from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    owner_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (
        UniqueConstraint("family_id", "email", name="uq_family_members_family_email"),
    )

    id = Column(Integer, primary_key=True)
    family_id = Column(
        Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="member")
    status = Column(String(20), nullable=False, default="pending")
    invited_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)


class AccountFamilyAccess(Base):
    """Явный доступ участника к общему счёту.

    Сам факт участия в Family не открывает личные счета. Владелец счёта сам
    включает общий режим и выбирает, кто может только смотреть счёт, а кто —
    также добавлять операции и корректировать остаток.
    """

    __tablename__ = "account_family_access"
    __table_args__ = (
        UniqueConstraint("account_id", "user_id", name="uq_account_family_access_user"),
    )

    id = Column(Integer, primary_key=True)
    account_id = Column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    permission = Column(String(16), nullable=False, default="viewer")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FamilySettlement(Base):
    __tablename__ = "family_settlements"

    id = Column(Integer, primary_key=True)
    family_id = Column(
        Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    from_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    to_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)
    date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    description = Column(String(500), nullable=True)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Возмещение — настоящее перемещение денег между счетами участников.
    # Старые записи могут не иметь этих полей, поэтому они nullable.
    from_account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    to_account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)


class FamilyExpenseAccounting(Base):
    """Подтверждённое владельцем включение общей покупки в его учёт.

    Исходная операция остаётся реальным расходом участника, но до принятия
    владельцем не меняет семейную аналитику и не формирует долг к возврату.
    """

    __tablename__ = "family_expense_accounting"
    __table_args__ = (
        UniqueConstraint("source_transaction_id", name="uq_family_expense_accounting_source"),
    )

    id = Column(Integer, primary_key=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    source_transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    source_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    owner_category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | accepted
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FamilyCategoryMapping(Base):
    """Как категория участника должна учитываться в аналитике владельца."""

    __tablename__ = "family_category_mappings"
    __table_args__ = (
        UniqueConstraint(
            "family_id", "source_user_id", "source_category_id", "owner_user_id",
            name="uq_family_category_mapping_source_owner",
        ),
    )

    id = Column(Integer, primary_key=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    source_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner_category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
