"""add dashboard balance privacy preference

Revision ID: ef6a7b8c9d0e
Revises: de5f6a7b8c9d
Create Date: 2026-08-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ef6a7b8c9d0e"
down_revision: Union[str, Sequence[str], None] = "de5f6a7b8c9d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("hide_dashboard_balances", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("users", "hide_dashboard_balances", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "hide_dashboard_balances")
