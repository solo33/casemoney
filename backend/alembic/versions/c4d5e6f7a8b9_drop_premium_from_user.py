"""drop_premium_from_user

Plans were collapsed into a single "Personal" plan, so the per-user premium
flags are no longer used.

Revision ID: c4d5e6f7a8b9
Revises: a7b8c9d0e1f2
Create Date: 2026-06-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("users", "premium_until")
    op.drop_column("users", "is_premium")


def downgrade() -> None:
    op.add_column("users", sa.Column("is_premium", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("premium_until", sa.DateTime(timezone=True), nullable=True))
