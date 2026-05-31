"""add sort_order to accounts

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-31
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    # Начальный порядок = по id внутри группы.
    op.execute("UPDATE accounts SET sort_order = id")


def downgrade() -> None:
    op.drop_column("accounts", "sort_order")
