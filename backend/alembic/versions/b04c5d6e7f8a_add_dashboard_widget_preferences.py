"""add dashboard widget preferences

Revision ID: b04c5d6e7f8a
Revises: a93b2c4d5e6f
Create Date: 2026-08-14
"""

from alembic import op
import sqlalchemy as sa


revision = "b04c5d6e7f8a"
down_revision = "a93b2c4d5e6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("dashboard_widgets", sa.JSON(), nullable=True))
    op.execute("UPDATE users SET dashboard_widgets = '{}' WHERE dashboard_widgets IS NULL")
    op.alter_column("users", "dashboard_widgets", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "dashboard_widgets")
