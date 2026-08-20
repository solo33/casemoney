"""store mortgage payment principal and interest split

Revision ID: f8a9b0c1d2e3
Revises: e1f2a3b4c5d6
Create Date: 2026-08-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credit_payments", sa.Column("principal_amount", sa.Float(), nullable=True))
    op.add_column("credit_payments", sa.Column("interest_amount", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("credit_payments", "interest_amount")
    op.drop_column("credit_payments", "principal_amount")
