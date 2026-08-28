from sqlalchemy import Boolean, Column, Integer, String, Float, ForeignKey, DateTime, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TransactionType(enum.Enum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "client_request_id",
            name="uq_transactions_user_client_request",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)  # валюта транзакции — определяет, какой balance счёта меняется
    type = Column(Enum(TransactionType), nullable=False)
    description = Column(String, nullable=True)
    date = Column(DateTime(timezone=True), server_default=func.now())

    # Технические метки: когда запись создана / последний раз изменена.
    # updated_at обновляется автоматически при любом изменении строки (onupdate).
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Protects financial writes from duplicate browser retries.
    client_request_id = Column(String(64), nullable=True)
    client_request_hash = Column(String(64), nullable=True)

    # Для переводов: счёт-получатель и сумма зачисления (в его валюте).
    # У income/expense эти поля NULL.
    to_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    to_amount = Column(Float, nullable=True)
    to_currency = Column(String(10), nullable=True)

    # Снимок курса на момент записи. Храним коэффициент перевода одной
    # единицы валюты операции в ``valuation_currency`` (обычно основную
    # валюту пользователя). Это защищает историю и отчёты от переоценки при
    # следующем обновлении внешнего курса. Для перевода есть второй снимок —
    # у стороны зачисления может быть другая валюта.
    valuation_currency = Column(String(10), nullable=True)
    exchange_rate = Column(Float, nullable=True)
    exchange_rate_source = Column(String(24), nullable=True)
    to_exchange_rate = Column(Float, nullable=True)
    to_exchange_rate_source = Column(String(24), nullable=True)

    # Commission input stays with the transfer; the ledger also contains a
    # linked expense row so that reports include it by category.
    fee_amount = Column(Float, nullable=True)
    fee_category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    # Комиссия перевода хранится отдельной расходной записью, связанной с переводом.
    # Поле на расходной записи, чтобы при удалении/редактировании перевода найти её.
    linked_transfer_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=True, index=True)

    # Семейная операция видна участникам семьи в отдельном отчёте. Она всё
    # равно принадлежит владельцу счёта и не открывает семье его прочие данные.
    family_id = Column(Integer, ForeignKey("families.id", ondelete="SET NULL"), nullable=True)
    is_family_expense = Column(Boolean, nullable=False, default=False)
    reimbursement_amount = Column(Float, nullable=False, default=0)
    # Changes a balance but must not be counted as earned income in reports.
    is_financing = Column(Boolean, nullable=False, default=False)
    # A future/planned operation is visible in planning reports but does not affect an account balance yet.
    is_planned = Column(Boolean, nullable=False, default=False)

    account = relationship("Account", foreign_keys=[account_id], back_populates="transactions")
    # Tags are independent from income/expense categories and may be used for
    # projects such as a trip, renovation, or a client.
    tags = relationship("Tag", secondary="transaction_tags", back_populates="transactions")
