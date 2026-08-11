"""add recurring transactions

Revision ID: f05a6b7c8d9e
Revises: ef5a6b7c8d9e
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f05a6b7c8d9e"
down_revision = "ef5a6b7c8d9e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurring_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("type", postgresql.ENUM("income", "expense", "transfer", name="transactiontype", create_type=False), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("frequency", sa.String(length=16), nullable=False, server_default="monthly"),
        sa.Column("next_date", sa.Date(), nullable=False),
        sa.Column("last_generated_for", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_recurring_transactions_user_id", "recurring_transactions", ["user_id"])
    op.create_index("ix_recurring_transactions_next_date", "recurring_transactions", ["next_date"])


def downgrade() -> None:
    op.drop_index("ix_recurring_transactions_next_date", table_name="recurring_transactions")
    op.drop_index("ix_recurring_transactions_user_id", table_name="recurring_transactions")
    op.drop_table("recurring_transactions")
