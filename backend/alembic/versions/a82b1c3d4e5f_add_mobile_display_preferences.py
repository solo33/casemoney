"""add mobile display preferences

Revision ID: a82b1c3d4e5f
Revises: c1aacf4f7730
Create Date: 2026-08-13
"""

from alembic import op
import sqlalchemy as sa


revision = "a82b1c3d4e5f"
down_revision = "c1aacf4f7730"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("hide_zero_balance_currencies", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "hide_zero_balance_currencies")
