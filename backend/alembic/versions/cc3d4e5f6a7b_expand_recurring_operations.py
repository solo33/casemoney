"""expand recurring operation controls and run log

Revision ID: cc3d4e5f6a7b
Revises: cb2d3e4f5a6b
Create Date: 2026-08-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cc3d4e5f6a7b"
down_revision: Union[str, Sequence[str], None] = "cb2d3e4f5a6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recurring_transactions", sa.Column("custom_interval_days", sa.Integer(), nullable=True))
    op.add_column("recurring_transactions", sa.Column("execution_mode", sa.String(length=16), nullable=False, server_default="planned"))
    op.add_column("recurring_transactions", sa.Column("reminder_days", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("recurring_transactions", sa.Column("end_date", sa.Date(), nullable=True))
    op.alter_column("recurring_transactions", "execution_mode", server_default=None)
    op.alter_column("recurring_transactions", "reminder_days", server_default=None)
    op.create_table(
        "recurring_transaction_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recurring_transaction_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_for", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["recurring_transaction_id"], ["recurring_transactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("recurring_transaction_id", "scheduled_for", name="uq_recurring_run_date"),
    )
    op.create_index("ix_recurring_transaction_runs_recurring_transaction_id", "recurring_transaction_runs", ["recurring_transaction_id"])
    op.create_index("ix_recurring_transaction_runs_scheduled_for", "recurring_transaction_runs", ["scheduled_for"])


def downgrade() -> None:
    op.drop_index("ix_recurring_transaction_runs_scheduled_for", table_name="recurring_transaction_runs")
    op.drop_index("ix_recurring_transaction_runs_recurring_transaction_id", table_name="recurring_transaction_runs")
    op.drop_table("recurring_transaction_runs")
    op.drop_column("recurring_transactions", "end_date")
    op.drop_column("recurring_transactions", "reminder_days")
    op.drop_column("recurring_transactions", "execution_mode")
    op.drop_column("recurring_transactions", "custom_interval_days")
