"""add user default quick operation type

Revision ID: cd4e5f6a7b8c
Revises: cc3d4e5f6a7b
Create Date: 2026-08-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cd4e5f6a7b8c"
down_revision: Union[str, Sequence[str], None] = "cc3d4e5f6a7b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "default_quick_operation_type",
            sa.String(length=16),
            nullable=False,
            server_default="expense",
        ),
    )
    op.alter_column("users", "default_quick_operation_type", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "default_quick_operation_type")
