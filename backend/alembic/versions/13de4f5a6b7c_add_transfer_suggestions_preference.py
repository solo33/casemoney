"""add transfer suggestions preference

Revision ID: 13de4f5a6b7c
Revises: 12ce4f5a6b7c
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa


revision = "13de4f5a6b7c"
down_revision = "12ce4f5a6b7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "show_transfer_suggestions",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("users", "show_transfer_suggestions", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "show_transfer_suggestions")
