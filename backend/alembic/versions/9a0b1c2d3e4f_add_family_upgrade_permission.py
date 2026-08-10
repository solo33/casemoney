"""add family upgrade permission

Revision ID: 9a0b1c2d3e4f
Revises: 8f9a0b1c2d3e
"""

from alembic import op
import sqlalchemy as sa


revision = "9a0b1c2d3e4f"
down_revision = "8f9a0b1c2d3e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("family_upgrade_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "family_upgrade_enabled")
