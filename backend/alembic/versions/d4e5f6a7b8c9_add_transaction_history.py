"""add transaction_history

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-31
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transaction_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("op_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("account_name", sa.String(), nullable=True),
        sa.Column("category_name", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("prev_amount", sa.Float(), nullable=True),
        sa.Column("prev_currency", sa.String(length=10), nullable=True),
    )
    op.create_index("ix_transaction_history_user_id", "transaction_history", ["user_id"])
    op.create_index("ix_transaction_history_changed_at", "transaction_history", ["changed_at"])


def downgrade() -> None:
    op.drop_index("ix_transaction_history_changed_at", table_name="transaction_history")
    op.drop_index("ix_transaction_history_user_id", table_name="transaction_history")
    op.drop_table("transaction_history")
