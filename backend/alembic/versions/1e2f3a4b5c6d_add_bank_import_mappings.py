"""add bank import mappings

Revision ID: 1e2f3a4b5c6d
Revises: 0d1e2f3a4b5c
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1e2f3a4b5c6d"
down_revision: Union[str, Sequence[str], None] = "0d1e2f3a4b5c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bank_account_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("bank", sa.String(length=32), nullable=False),
        sa.Column("source_key", sa.String(length=160), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "bank",
            "source_key",
            name="uq_bank_account_mapping_source",
        ),
    )
    op.create_table(
        "bank_category_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("bank", sa.String(length=32), nullable=False),
        sa.Column("transaction_type", sa.String(length=16), nullable=False),
        sa.Column("source_key", sa.String(length=160), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "bank",
            "transaction_type",
            "source_key",
            name="uq_bank_category_mapping_source",
        ),
    )


def downgrade() -> None:
    op.drop_table("bank_category_mappings")
    op.drop_table("bank_account_mappings")
