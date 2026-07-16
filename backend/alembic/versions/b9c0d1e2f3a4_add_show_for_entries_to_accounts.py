"""add show_for_entries to accounts

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-07-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "show_for_entries",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    # Preserve the current user expectation: accounts excluded from the
    # overall balance start hidden in transaction-entry forms.
    op.execute(
        sa.text(
            "UPDATE accounts "
            "SET show_for_entries = include_in_balance"
        )
    )


def downgrade() -> None:
    op.drop_column("accounts", "show_for_entries")
