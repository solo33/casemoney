"""add notification preferences

Revision ID: fa0b1c2d3e4f
Revises: f9b0c1d2e3f4
Create Date: 2026-08-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa0b1c2d3e4f"
down_revision: Union[str, Sequence[str], None] = "f9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("notification_preferences", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.alter_column("users", "notification_preferences", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "notification_preferences")
