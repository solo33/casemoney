"""add parent_id to categories

Revision ID: 7f256e85c95a
Revises: 5cc08d01d0e3
Create Date: 2026-05-28 13:11:06.671231

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f256e85c95a'
down_revision: Union[str, Sequence[str], None] = '5cc08d01d0e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Self-referencing FK с ON DELETE CASCADE: при удалении родителя удаляются все дочерние.
    op.add_column(
        'categories',
        sa.Column('parent_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_categories_parent_id_categories',
        'categories',
        'categories',
        ['parent_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(
        'ix_categories_user_parent',
        'categories',
        ['user_id', 'parent_id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_categories_user_parent', table_name='categories')
    op.drop_constraint('fk_categories_parent_id_categories', 'categories', type_='foreignkey')
    op.drop_column('categories', 'parent_id')
