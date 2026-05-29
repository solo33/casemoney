"""add account_groups table and group_id to accounts

Revision ID: 6da4c9d623b2
Revises: 7f256e85c95a
Create Date: 2026-05-29 06:43:14.856974

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6da4c9d623b2'
down_revision: Union[str, Sequence[str], None] = '7f256e85c95a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. account_groups
    op.create_table(
        'account_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_account_groups_id', 'account_groups', ['id'])
    op.create_index('ix_account_groups_user_sort', 'account_groups', ['user_id', 'sort_order'])

    # 2. accounts.group_id
    op.add_column('accounts', sa.Column('group_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_accounts_group_id_account_groups',
        'accounts', 'account_groups',
        ['group_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_accounts_group_id_account_groups', 'accounts', type_='foreignkey')
    op.drop_column('accounts', 'group_id')
    op.drop_index('ix_account_groups_user_sort', table_name='account_groups')
    op.drop_index('ix_account_groups_id', table_name='account_groups')
    op.drop_table('account_groups')
