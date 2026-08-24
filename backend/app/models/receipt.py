from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Receipt(Base):
    """A private receipt attachment with optional manual line items."""

    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    merchant = Column(String(255), nullable=True)
    receipt_date = Column(Date, nullable=True)
    total_amount = Column(Float, nullable=True)
    currency = Column(String(10), nullable=False, default="RUB")
    note = Column(Text, nullable=True)

    # The filename visible to the user is stored separately from the generated
    # filesystem name. Files are only served through an authorised API route.
    original_filename = Column(String(255), nullable=False)
    storage_key = Column(String(255), nullable=False, unique=True)
    content_type = Column(String(120), nullable=True)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    items = relationship("ReceiptItem", back_populates="receipt", cascade="all, delete-orphan", order_by="ReceiptItem.sort_order")


class ReceiptItem(Base):
    __tablename__ = "receipt_items"

    id = Column(Integer, primary_key=True, index=True)
    receipt_id = Column(Integer, ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    quantity = Column(Float, nullable=True)
    unit_price = Column(Float, nullable=True)
    total_amount = Column(Float, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    receipt = relationship("Receipt", back_populates="items")
