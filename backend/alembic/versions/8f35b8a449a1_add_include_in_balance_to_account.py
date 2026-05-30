"""add_include_in_balance_to_account

Revision ID: 8f35b8a449a1
Revises: 679d72bf82d6
Create Date: 2026-05-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "8f35b8a449a1"
down_revision: Union[str, Sequence[str], None] = "679d72bf82d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("include_in_balance", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("accounts", "include_in_balance")
