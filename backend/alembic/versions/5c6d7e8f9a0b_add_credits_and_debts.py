"""add credits and debts

Revision ID: 5c6d7e8f9a0b
Revises: 4b5c6d7e8f9a
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5c6d7e8f9a0b"
down_revision: Union[str, None] = "4b5c6d7e8f9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "credit_obligations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("direction", sa.String(length=16), nullable=False, server_default="owe"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="RUB"),
        sa.Column("counterparty", sa.String(length=160), nullable=True),
        sa.Column("original_amount", sa.Float(), nullable=True),
        sa.Column("current_balance", sa.Float(), nullable=True),
        sa.Column("credit_limit", sa.Float(), nullable=True),
        sa.Column("monthly_payment", sa.Float(), nullable=True),
        sa.Column("due_day", sa.Integer(), nullable=True),
        sa.Column("statement_day", sa.Integer(), nullable=True),
        sa.Column("next_payment_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("reminder_days_before", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("source_account_id", sa.Integer(), nullable=True),
        sa.Column("linked_account_id", sa.Integer(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_reminder_for_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_account_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_account_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_credit_obligations_id"), "credit_obligations", ["id"], unique=False)
    op.create_index(op.f("ix_credit_obligations_user_id"), "credit_obligations", ["user_id"], unique=False)
    op.create_index(op.f("ix_credit_obligations_next_payment_date"), "credit_obligations", ["next_payment_date"], unique=False)
    op.create_table(
        "credit_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("credit_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("balance_after", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["credit_id"], ["credit_obligations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_credit_payments_id"), "credit_payments", ["id"], unique=False)
    op.create_index(op.f("ix_credit_payments_credit_id"), "credit_payments", ["credit_id"], unique=False)
    op.create_index(op.f("ix_credit_payments_user_id"), "credit_payments", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_credit_payments_user_id"), table_name="credit_payments")
    op.drop_index(op.f("ix_credit_payments_credit_id"), table_name="credit_payments")
    op.drop_index(op.f("ix_credit_payments_id"), table_name="credit_payments")
    op.drop_table("credit_payments")
    op.drop_index(op.f("ix_credit_obligations_next_payment_date"), table_name="credit_obligations")
    op.drop_index(op.f("ix_credit_obligations_user_id"), table_name="credit_obligations")
    op.drop_index(op.f("ix_credit_obligations_id"), table_name="credit_obligations")
    op.drop_table("credit_obligations")
