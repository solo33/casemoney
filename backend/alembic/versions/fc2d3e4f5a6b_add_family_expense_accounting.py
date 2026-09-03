"""add family expense accounting

Revision ID: fc2d3e4f5a6b
Revises: 13de4f5a6b7c
Create Date: 2026-09-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fc2d3e4f5a6b"
down_revision: Union[str, Sequence[str], None] = "13de4f5a6b7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("family_settlements", sa.Column("from_account_id", sa.Integer(), nullable=True))
    op.add_column("family_settlements", sa.Column("to_account_id", sa.Integer(), nullable=True))
    op.add_column("family_settlements", sa.Column("transaction_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_family_settlements_from_account", "family_settlements", "accounts", ["from_account_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_family_settlements_to_account", "family_settlements", "accounts", ["to_account_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_family_settlements_transaction", "family_settlements", "transactions", ["transaction_id"], ["id"], ondelete="SET NULL")

    op.create_table(
        "family_expense_accounting",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_transaction_id", sa.Integer(), sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("owner_category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("source_transaction_id", name="uq_family_expense_accounting_source"),
    )
    op.create_index("ix_family_expense_accounting_family_id", "family_expense_accounting", ["family_id"], unique=False)
    op.create_table(
        "family_category_mappings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("family_id", "source_user_id", "source_category_id", "owner_user_id", name="uq_family_category_mapping_source_owner"),
    )


def downgrade() -> None:
    op.drop_table("family_category_mappings")
    op.drop_index("ix_family_expense_accounting_family_id", table_name="family_expense_accounting")
    op.drop_table("family_expense_accounting")
    op.drop_constraint("fk_family_settlements_transaction", "family_settlements", type_="foreignkey")
    op.drop_constraint("fk_family_settlements_to_account", "family_settlements", type_="foreignkey")
    op.drop_constraint("fk_family_settlements_from_account", "family_settlements", type_="foreignkey")
    op.drop_column("family_settlements", "transaction_id")
    op.drop_column("family_settlements", "to_account_id")
    op.drop_column("family_settlements", "from_account_id")
