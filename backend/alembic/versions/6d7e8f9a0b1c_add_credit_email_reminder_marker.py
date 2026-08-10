"""add credit email reminder marker

Revision ID: 6d7e8f9a0b1c
Revises: 5c6d7e8f9a0b
"""

from alembic import op
import sqlalchemy as sa


revision = "6d7e8f9a0b1c"
down_revision = "5c6d7e8f9a0b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "credit_obligations",
        sa.Column("last_email_reminder_for_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("credit_obligations", "last_email_reminder_for_date")
