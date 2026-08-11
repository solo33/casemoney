"""add account notes hidden categories and transfer fees

Revision ID: 0a1b2c3d4e5f
Revises: f16a7b8c9d0e
"""
from alembic import op
import sqlalchemy as sa


revision = "0a1b2c3d4e5f"
down_revision = "f16a7b8c9d0e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("note", sa.Text(), nullable=True))
    op.add_column("categories", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("transactions", sa.Column("fee_amount", sa.Float(), nullable=True))
    op.add_column("transactions", sa.Column("fee_category_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_transactions_fee_category", "transactions", "categories", ["fee_category_id"], ["id"])
    op.add_column("transactions", sa.Column("linked_transfer_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_transactions_linked_transfer", "transactions", "transactions", ["linked_transfer_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_transactions_linked_transfer_id", "transactions", ["linked_transfer_id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_linked_transfer_id", table_name="transactions")
    op.drop_constraint("fk_transactions_linked_transfer", "transactions", type_="foreignkey")
    op.drop_column("transactions", "linked_transfer_id")
    op.drop_constraint("fk_transactions_fee_category", "transactions", type_="foreignkey")
    op.drop_column("transactions", "fee_category_id")
    op.drop_column("transactions", "fee_amount")
    op.drop_column("categories", "is_hidden")
    op.drop_column("accounts", "note")
