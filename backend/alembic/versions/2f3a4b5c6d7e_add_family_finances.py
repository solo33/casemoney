"""add family finances

Revision ID: 2f3a4b5c6d7e
Revises: 1e2f3a4b5c6d
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2f3a4b5c6d7e"
down_revision: Union[str, Sequence[str], None] = "1e2f3a4b5c6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "families",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "family_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), server_default="member", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("family_id", "email", name="uq_family_members_family_email"),
    )
    op.create_table(
        "family_settlements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("from_user_id", sa.Integer(), nullable=False),
        sa.Column("to_user_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("transactions", sa.Column("family_id", sa.Integer(), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("is_family_expense", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "transactions",
        sa.Column("reimbursement_amount", sa.Float(), server_default="0", nullable=False),
    )
    op.create_foreign_key(
        "fk_transactions_family_id",
        "transactions",
        "families",
        ["family_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_transactions_family_id", "transactions", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_family_id", table_name="transactions")
    op.drop_constraint("fk_transactions_family_id", "transactions", type_="foreignkey")
    op.drop_column("transactions", "reimbursement_amount")
    op.drop_column("transactions", "is_family_expense")
    op.drop_column("transactions", "family_id")
    op.drop_table("family_settlements")
    op.drop_table("family_members")
    op.drop_table("families")
