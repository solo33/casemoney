"""mark early credit repayments

Revision ID: f9b0c1d2e3f4
Revises: a9b0c1d2e3f4
Create Date: 2026-08-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f9b0c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "credit_payments",
        sa.Column("is_early_payment", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("credit_payments", "is_early_payment", server_default=None)


def downgrade() -> None:
    op.drop_column("credit_payments", "is_early_payment")
