"""add_is_admin_to_user

Revision ID: 10f72171354c
Revises: 4a1272e5482d
Create Date: 2026-05-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "10f72171354c"
down_revision: Union[str, Sequence[str], None] = "4a1272e5482d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "is_admin")
