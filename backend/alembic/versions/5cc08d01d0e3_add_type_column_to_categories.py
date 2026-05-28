"""add type column to categories

Revision ID: 5cc08d01d0e3
Revises: a38a30d36fcb
Create Date: 2026-05-24 21:37:22.944333

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5cc08d01d0e3'
down_revision: Union[str, Sequence[str], None] = 'a38a30d36fcb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Добавляем колонку с дефолтом 'expense', чтобы NOT NULL не сломал существующие строки
    op.add_column(
        'categories',
        sa.Column('type', sa.String(), nullable=False, server_default='expense'),
    )
    # 2. Проставляем 'income' для дефолтных доходных категорий по имени
    op.execute(
        "UPDATE categories SET type = 'income' "
        "WHERE name IN ('Зарплата', 'Фриланс', 'Подарки')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('categories', 'type')
