"""add billing_enabled toggle to app_config

Revision ID: c9d1e2f3a4b5
Revises: fb1c2d3e4f5a
Create Date: 2026-08-24
"""
from alembic import op
import sqlalchemy as sa


revision = "c9d1e2f3a4b5"
down_revision = "fb1c2d3e4f5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_config",
        sa.Column("billing_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("app_config", "billing_enabled")
