"""add mortgage early repayment settings

Revision ID: cb2d3e4f5a6b
Revises: ca1d2e3f4a5b
Create Date: 2026-08-24
"""

from alembic import op
import sqlalchemy as sa


revision = "cb2d3e4f5a6b"
down_revision = "ca1d2e3f4a5b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "credit_obligations",
        sa.Column("early_repayment_mode", sa.String(length=24), nullable=False, server_default="reduce_term"),
    )
    op.add_column("credit_payments", sa.Column("early_repayment_mode", sa.String(length=24), nullable=True))
    op.alter_column("credit_obligations", "early_repayment_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("credit_payments", "early_repayment_mode")
    op.drop_column("credit_obligations", "early_repayment_mode")
