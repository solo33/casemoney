"""add_premium_to_user

Revision ID: 4a1272e5482d
Revises: e82d1146d80d
Create Date: 2026-05-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "4a1272e5482d"
down_revision: Union[str, Sequence[str], None] = "e82d1146d80d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_premium", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("premium_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "premium_until")
    op.drop_column("users", "is_premium")
