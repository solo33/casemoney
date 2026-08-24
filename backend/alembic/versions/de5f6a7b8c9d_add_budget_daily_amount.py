"""add daily budget spending target

Revision ID: de5f6a7b8c9d
Revises: cd4e5f6a7b8c
Create Date: 2026-08-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "de5f6a7b8c9d"
down_revision: Union[str, Sequence[str], None] = "cd4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("daily_amount", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("budgets", "daily_amount")
