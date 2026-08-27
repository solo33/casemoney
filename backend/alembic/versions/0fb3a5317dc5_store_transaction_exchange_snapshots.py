"""store transaction exchange snapshots

Revision ID: 0fb3a5317dc5
Revises: f18b9c0d1e2f
Create Date: 2026-08-27 22:42:17.968883

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0fb3a5317dc5'
down_revision: Union[str, Sequence[str], None] = 'f18b9c0d1e2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("valuation_currency", sa.String(length=10), nullable=True))
    op.add_column("transactions", sa.Column("exchange_rate", sa.Float(), nullable=True))
    op.add_column("transactions", sa.Column("exchange_rate_source", sa.String(length=24), nullable=True))
    op.add_column("transactions", sa.Column("to_exchange_rate", sa.Float(), nullable=True))
    op.add_column("transactions", sa.Column("to_exchange_rate_source", sa.String(length=24), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "to_exchange_rate_source")
    op.drop_column("transactions", "to_exchange_rate")
    op.drop_column("transactions", "exchange_rate_source")
    op.drop_column("transactions", "exchange_rate")
    op.drop_column("transactions", "valuation_currency")
