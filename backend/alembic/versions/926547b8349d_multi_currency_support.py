"""multi_currency_support

Revision ID: 926547b8349d
Revises: 6da4c9d623b2
Create Date: 2026-05-29

Changes:
- users.main_currency (default RUB)
- transactions.currency (NOT NULL, backfilled from accounts.currency)
- account_balances table (one balance row per account+currency)
- backfill account_balances from accounts.{currency, balance}
- drop accounts.balance and accounts.currency
- exchange_rates table for FX cache
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "926547b8349d"
down_revision: Union[str, Sequence[str], None] = "6da4c9d623b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users.main_currency
    op.add_column(
        "users",
        sa.Column("main_currency", sa.String(length=10), nullable=False, server_default="RUB"),
    )

    # 2. transactions.currency — nullable, backfill, then NOT NULL
    op.add_column(
        "transactions",
        sa.Column("currency", sa.String(length=10), nullable=True),
    )
    op.execute(
        """
        UPDATE transactions
        SET currency = a.currency
        FROM accounts a
        WHERE transactions.account_id = a.id
        """
    )
    # На случай если какие-то транзакции остались без матча — fallback на RUB
    op.execute("UPDATE transactions SET currency = 'RUB' WHERE currency IS NULL")
    op.alter_column("transactions", "currency", nullable=False)

    # 3. account_balances table
    op.create_table(
        "account_balances",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "account_id",
            sa.Integer,
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("balance", sa.Float, nullable=False, server_default="0"),
        sa.UniqueConstraint("account_id", "currency", name="uq_account_currency"),
    )
    op.create_index(
        "ix_account_balances_account_id",
        "account_balances",
        ["account_id"],
    )

    # 4. Backfill: для каждого счёта одна строка с его текущей валютой и балансом
    op.execute(
        """
        INSERT INTO account_balances (account_id, currency, balance)
        SELECT id, currency, balance FROM accounts
        """
    )

    # 5. Drop columns from accounts
    op.drop_column("accounts", "balance")
    op.drop_column("accounts", "currency")

    # 6. exchange_rates cache
    op.create_table(
        "exchange_rates",
        sa.Column("from_currency", sa.String(length=10), primary_key=True),
        sa.Column("to_currency", sa.String(length=10), primary_key=True),
        sa.Column("rate", sa.Float, nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("exchange_rates")

    # Restore accounts.balance/currency columns
    op.add_column("accounts", sa.Column("currency", sa.String(), nullable=True))
    op.add_column("accounts", sa.Column("balance", sa.Float(), nullable=True))

    # Restore from account_balances (берём одну строку на счёт)
    op.execute(
        """
        UPDATE accounts SET
            balance  = ab.balance,
            currency = ab.currency
        FROM (
            SELECT DISTINCT ON (account_id) account_id, currency, balance
            FROM account_balances
            ORDER BY account_id, id
        ) ab
        WHERE accounts.id = ab.account_id
        """
    )

    op.drop_index("ix_account_balances_account_id", table_name="account_balances")
    op.drop_table("account_balances")

    op.drop_column("transactions", "currency")
    op.drop_column("users", "main_currency")
