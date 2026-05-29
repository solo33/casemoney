"""add_goals_table

Revision ID: e82d1146d80d
Revises: 58a87f2b7956
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e82d1146d80d"
down_revision: Union[str, Sequence[str], None] = "58a87f2b7956"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("icon", sa.String(length=16), nullable=True),
        sa.Column("target_amount", sa.Float, nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="RUB"),
        sa.Column("current_amount", sa.Float, nullable=False, server_default="0"),
        sa.Column("account_id", sa.Integer, sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_goals_user", "goals", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_goals_user", table_name="goals")
    op.drop_table("goals")
