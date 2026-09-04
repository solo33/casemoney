"""link accepted family purchases to owner expenses

Revision ID: fe0a1b2c3d4e
Revises: fd3e4f5a6b7c
Create Date: 2026-09-04
"""

from alembic import op
import sqlalchemy as sa


revision = "fe0a1b2c3d4e"
down_revision = "fd3e4f5a6b7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "family_expense_accounting",
        sa.Column("owner_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "family_expense_accounting",
        sa.Column("owner_transaction_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_family_expense_accounting_owner_account",
        "family_expense_accounting", "accounts", ["owner_account_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_family_expense_accounting_owner_transaction",
        "family_expense_accounting", "transactions", ["owner_transaction_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_family_expense_accounting_owner_transaction", "family_expense_accounting", type_="foreignkey")
    op.drop_constraint("fk_family_expense_accounting_owner_account", "family_expense_accounting", type_="foreignkey")
    op.drop_column("family_expense_accounting", "owner_transaction_id")
    op.drop_column("family_expense_accounting", "owner_account_id")
