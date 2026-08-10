"""add credit funding movements

Revision ID: ab1c2d3e4f5a
Revises: aa10bb20cc30
"""

from alembic import op
import sqlalchemy as sa


revision = "ab1c2d3e4f5a"
down_revision = "aa10bb20cc30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("is_financing", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "credit_obligations",
        sa.Column("funds_received", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "credit_obligations",
        sa.Column("funds_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "credit_obligations",
        sa.Column("funding_transaction_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_credit_obligations_funds_account_id_accounts",
        "credit_obligations",
        "accounts",
        ["funds_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_credit_obligations_funding_transaction_id_transactions",
        "credit_obligations",
        "transactions",
        ["funding_transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_credit_obligations_funding_transaction_id_transactions",
        "credit_obligations",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_credit_obligations_funds_account_id_accounts",
        "credit_obligations",
        type_="foreignkey",
    )
    op.drop_column("credit_obligations", "funding_transaction_id")
    op.drop_column("credit_obligations", "funds_account_id")
    op.drop_column("credit_obligations", "funds_received")
    op.drop_column("transactions", "is_financing")
