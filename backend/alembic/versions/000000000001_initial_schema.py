"""Create the legacy core schema used as the Alembic baseline.

Revision ID: 000000000001
Revises:

The project originally created these tables with SQLAlchemy ``create_all``.
Later migrations therefore assumed that the core schema already existed.  This
baseline makes a fresh database reproducible without changing the migration
state of installations that are already at a later revision.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "000000000001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


transaction_type = sa.Enum("income", "expense", "transfer", name="transactiontype")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        # The next historical migration makes this NOT NULL.
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_categories_id", "categories", ["id"])

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("balance", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(), nullable=True),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column("icon", sa.String(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_accounts_id", "accounts", ["id"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("date", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transactions_id", "transactions", ["id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_id", table_name="transactions")
    op.drop_table("transactions")
    op.drop_index("ix_accounts_id", table_name="accounts")
    op.drop_table("accounts")
    op.drop_index("ix_categories_id", table_name="categories")
    op.drop_table("categories")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")
    transaction_type.drop(op.get_bind(), checkfirst=True)
