"""add_user_currencies_table

Revision ID: 58a87f2b7956
Revises: 926547b8349d
Create Date: 2026-05-29

Создаёт user_currencies + наполняет её существующими валютами пользователей
(из account_balances + main_currency).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "58a87f2b7956"
down_revision: Union[str, Sequence[str], None] = "926547b8349d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_currencies",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=True),
        sa.Column("short_code", sa.String(length=10), nullable=True),
        sa.Column("manual_rate", sa.Float, nullable=True),
        sa.Column("auto", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("user_id", "currency", name="uq_user_currency"),
    )

    # Backfill: каждому пользователю — главную валюту + все валюты из их account_balances
    op.execute(
        """
        INSERT INTO user_currencies (user_id, currency, auto)
        SELECT id, main_currency, TRUE FROM users
        ON CONFLICT (user_id, currency) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO user_currencies (user_id, currency, auto)
        SELECT DISTINCT a.user_id, ab.currency, TRUE
        FROM account_balances ab
        JOIN accounts a ON a.id = ab.account_id
        ON CONFLICT (user_id, currency) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("user_currencies")
