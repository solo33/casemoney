"""add planned deposit interest drafts

Revision ID: 10ac2d3e4f5a
Revises: 0fb3a5317dc5
"""

from alembic import op
import sqlalchemy as sa


revision = "10ac2d3e4f5a"
down_revision = "0fb3a5317dc5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "credit_obligations",
        sa.Column("interest_accrual_mode", sa.String(length=16), nullable=False, server_default="manual"),
    )
    op.add_column(
        "credit_obligations",
        sa.Column("planned_interest_transaction_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_credit_obligations_planned_interest_transaction",
        "credit_obligations",
        "transactions",
        ["planned_interest_transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_credit_obligations_planned_interest_transaction", "credit_obligations", type_="foreignkey")
    op.drop_column("credit_obligations", "planned_interest_transaction_id")
    op.drop_column("credit_obligations", "interest_accrual_mode")
