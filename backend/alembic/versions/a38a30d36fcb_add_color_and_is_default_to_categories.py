"""add color and is_default to categories

Revision ID: a38a30d36fcb
Revises: 000000000001
Create Date: 2026-05-22 19:35:21.832121

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a38a30d36fcb'
down_revision: Union[str, Sequence[str], None] = '000000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('categories', sa.Column('color', sa.String(), nullable=True, server_default='#6366f1'))
    op.add_column('categories', sa.Column('is_default', sa.Boolean(), nullable=True, server_default='false'))
    op.alter_column('categories', 'user_id',
               existing_type=sa.INTEGER(),
               nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('categories', 'user_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.drop_column('categories', 'is_default')
    op.drop_column('categories', 'color')
