"""add sort order to categories

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_categories_user_parent_sort",
        "categories",
        ["user_id", "parent_id", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_categories_user_parent_sort", table_name="categories")
    op.drop_column("categories", "sort_order")
