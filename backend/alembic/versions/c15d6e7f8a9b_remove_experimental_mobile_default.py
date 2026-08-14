"""remove experimental mobile default operation setting

Revision ID: c15d6e7f8a9b
Revises: b04c5d6e7f8a
Create Date: 2026-08-14
"""

from alembic import op
import sqlalchemy as sa


revision = "c15d6e7f8a9b"
down_revision = "b04c5d6e7f8a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This column existed only in a local experimental revision and was never a product setting.
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS mobile_default_transaction_type")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("mobile_default_transaction_type", sa.String(length=16), nullable=True),
    )
