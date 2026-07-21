"""add transaction idempotency

Revision ID: 0d1e2f3a4b5c
Revises: c0d1e2f3a4b5
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0d1e2f3a4b5c"
down_revision: Union[str, Sequence[str], None] = "c0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("client_request_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("client_request_hash", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_transactions_user_client_request",
        "transactions",
        ["user_id", "client_request_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_transactions_user_client_request",
        "transactions",
        type_="unique",
    )
    op.drop_column("transactions", "client_request_hash")
    op.drop_column("transactions", "client_request_id")
