"""add receipt attachments and manual items

Revision ID: f18b9c0d1e2f
Revises: f17a8b9c0d1f
Create Date: 2026-08-24
"""

from alembic import op
import sqlalchemy as sa


revision = "f18b9c0d1e2f"
down_revision = "f17a8b9c0d1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("merchant", sa.String(length=255), nullable=True),
        sa.Column("receipt_date", sa.Date(), nullable=True),
        sa.Column("total_amount", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="RUB"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_receipts_user_id", "receipts", ["user_id"])
    op.create_index("ix_receipts_transaction_id", "receipts", ["transaction_id"])
    op.create_table(
        "receipt_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=True),
        sa.Column("unit_price", sa.Float(), nullable=True),
        sa.Column("total_amount", sa.Float(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["receipt_id"], ["receipts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_receipt_items_receipt_id", "receipt_items", ["receipt_id"])


def downgrade() -> None:
    op.drop_index("ix_receipt_items_receipt_id", table_name="receipt_items")
    op.drop_table("receipt_items")
    op.drop_index("ix_receipts_transaction_id", table_name="receipts")
    op.drop_index("ix_receipts_user_id", table_name="receipts")
    op.drop_table("receipts")
