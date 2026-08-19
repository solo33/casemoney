"""add family recurring suggestions

Revision ID: c9d0e1f2a3b4
Revises: c15d6e7f8a9b
"""

from alembic import op
import sqlalchemy as sa


revision = "c9d0e1f2a3b4"
down_revision = "c15d6e7f8a9b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recurring_transactions", sa.Column(
        "family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True,
    ))
    op.add_column("recurring_transactions", sa.Column(
        "is_family_expense", sa.Boolean(), nullable=False, server_default=sa.false(),
    ))
    op.add_column("recurring_transactions", sa.Column(
        "reimbursement_amount", sa.Float(), nullable=False, server_default="0",
    ))
    op.add_column("recurring_transactions", sa.Column("suggestion_fingerprint", sa.String(length=64), nullable=True))
    op.create_index("ix_recurring_transactions_family_id", "recurring_transactions", ["family_id"])
    op.create_index("ix_recurring_transactions_suggestion_fingerprint", "recurring_transactions", ["suggestion_fingerprint"])

    op.create_table(
        "family_recurring_suggestion_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("family_id", "fingerprint", name="uq_family_recurring_suggestion_decisions_family_fingerprint"),
    )
    op.create_index("ix_family_recurring_suggestion_decisions_family_id", "family_recurring_suggestion_decisions", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_family_recurring_suggestion_decisions_family_id", table_name="family_recurring_suggestion_decisions")
    op.drop_table("family_recurring_suggestion_decisions")
    op.drop_index("ix_recurring_transactions_suggestion_fingerprint", table_name="recurring_transactions")
    op.drop_index("ix_recurring_transactions_family_id", table_name="recurring_transactions")
    op.drop_column("recurring_transactions", "suggestion_fingerprint")
    op.drop_column("recurring_transactions", "reimbursement_amount")
    op.drop_column("recurring_transactions", "is_family_expense")
    op.drop_column("recurring_transactions", "family_id")
