"""add goal archive state

Revision ID: f07a8b9c0d1e
Revises: ef6a7b8c9d0e
Create Date: 2026-08-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f07a8b9c0d1e"
down_revision: Union[str, Sequence[str], None] = "ef6a7b8c9d0e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("goals", sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("goals", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("goals", "is_archived", server_default=None)


def downgrade() -> None:
    op.drop_column("goals", "archived_at")
    op.drop_column("goals", "is_archived")
