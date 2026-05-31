"""add created_at/updated_at to transactions

Revision ID: a1b2c3d4e5f6
Revises: 8f35b8a449a1
Create Date: 2026-05-31
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "8f35b8a449a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default=now() заполнит существующие строки текущим временем.
    op.add_column(
        "transactions",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    # Для старых записей выставим created_at/updated_at = дате транзакции,
    # чтобы "последние изменённые" сразу имели осмысленный порядок.
    op.execute("UPDATE transactions SET created_at = date, updated_at = date WHERE date IS NOT NULL")


def downgrade() -> None:
    op.drop_column("transactions", "updated_at")
    op.drop_column("transactions", "created_at")
