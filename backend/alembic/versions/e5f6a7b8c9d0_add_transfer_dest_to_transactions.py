"""add transfer destination to transactions

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-01
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("to_account_id", sa.Integer(), nullable=True))
    op.add_column("transactions", sa.Column("to_amount", sa.Float(), nullable=True))
    op.add_column("transactions", sa.Column("to_currency", sa.String(length=10), nullable=True))
    op.create_foreign_key(
        "fk_transactions_to_account", "transactions", "accounts",
        ["to_account_id"], ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_to_account", "transactions", type_="foreignkey")
    op.drop_column("transactions", "to_currency")
    op.drop_column("transactions", "to_amount")
    op.drop_column("transactions", "to_account_id")
