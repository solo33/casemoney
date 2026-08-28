"""add transaction tags

Revision ID: 12ce4f5a6b7c
Revises: 11bd3e4f5a6b
"""

from alembic import op
import sqlalchemy as sa


revision = "12ce4f5a6b7c"
down_revision = "11bd3e4f5a6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False, server_default="#2f6296"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_tags_user_name"),
    )
    op.create_index("ix_tags_user_id", "tags", ["user_id"], unique=False)
    op.create_table(
        "transaction_tags",
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("transaction_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("transaction_tags")
    op.drop_index("ix_tags_user_id", table_name="tags")
    op.drop_table("tags")
