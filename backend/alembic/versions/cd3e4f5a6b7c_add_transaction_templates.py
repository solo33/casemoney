"""add transaction templates

Revision ID: cd3e4f5a6b7c
Revises: bc2d3e4f5a6b
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cd3e4f5a6b7c"
down_revision = "bc2d3e4f5a6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    transaction_type = postgresql.ENUM(
        "income", "expense", "transfer", name="transactiontype", create_type=False,
    )
    op.create_table(
        "transaction_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transaction_templates_user_id", "transaction_templates", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_transaction_templates_user_id", table_name="transaction_templates")
    op.drop_table("transaction_templates")
