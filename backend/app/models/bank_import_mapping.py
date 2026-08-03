from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base


class BankAccountMapping(Base):
    __tablename__ = "bank_account_mappings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "bank",
            "source_key",
            name="uq_bank_account_mapping_source",
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    bank = Column(String(32), nullable=False)
    source_key = Column(String(160), nullable=False)
    account_id = Column(
        Integer,
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )


class BankCategoryMapping(Base):
    __tablename__ = "bank_category_mappings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "bank",
            "transaction_type",
            "source_key",
            name="uq_bank_category_mapping_source",
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    bank = Column(String(32), nullable=False)
    transaction_type = Column(String(16), nullable=False)
    source_key = Column(String(160), nullable=False)
    category_id = Column(
        Integer,
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False,
    )
