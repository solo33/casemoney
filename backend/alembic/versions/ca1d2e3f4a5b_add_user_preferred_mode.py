"""add selected user mode

Revision ID: ca1d2e3f4a5b
Revises: c9d1e2f3a4b5
Create Date: 2026-08-24
"""
from alembic import op
import sqlalchemy as sa


revision = "ca1d2e3f4a5b"
down_revision = "c9d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("preferred_mode", sa.String(length=16), nullable=False, server_default="personal"),
    )
    op.execute("UPDATE users SET preferred_mode = 'family' WHERE plan = 'family'")
    op.execute(
        "UPDATE users AS u SET preferred_mode = 'family' "
        "FROM family_members AS fm WHERE fm.user_id = u.id AND fm.status = 'active'"
    )
    op.alter_column("users", "preferred_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "preferred_mode")
