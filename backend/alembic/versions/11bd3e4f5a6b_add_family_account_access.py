"""add explicit family account access

Revision ID: 11bd3e4f5a6b
Revises: 10ac2d3e4f5a
"""

from alembic import op
import sqlalchemy as sa


revision = "11bd3e4f5a6b"
down_revision = "10ac2d3e4f5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("family_id", sa.Integer(), nullable=True))
    op.add_column(
        "accounts",
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_foreign_key(
        "fk_accounts_family_id", "accounts", "families", ["family_id"], ["id"], ondelete="SET NULL"
    )
    op.create_table(
        "account_family_access",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("permission", sa.String(length=16), nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("account_id", "user_id", name="uq_account_family_access_user"),
    )


def downgrade() -> None:
    op.drop_table("account_family_access")
    op.drop_constraint("fk_accounts_family_id", "accounts", type_="foreignkey")
    op.drop_column("accounts", "is_shared")
    op.drop_column("accounts", "family_id")
