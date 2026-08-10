"""add is_demo to users

Revision ID: 8f9a0b1c2d3e
Revises: 7e8f9a0b1c2d
"""

from alembic import op
import sqlalchemy as sa


revision = "8f9a0b1c2d3e"
down_revision = "7e8f9a0b1c2d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_users_is_demo", "users", ["is_demo"])


def downgrade() -> None:
    op.drop_index("ix_users_is_demo", table_name="users")
    op.drop_column("users", "is_demo")
