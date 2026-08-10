"""add user plan

Revision ID: 3a4b5c6d7e8f
Revises: 2f3a4b5c6d7e
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3a4b5c6d7e8f"
down_revision: Union[str, Sequence[str], None] = "2f3a4b5c6d7e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("plan", sa.String(length=16), server_default="personal", nullable=False),
    )
    op.create_check_constraint(
        "ck_users_plan",
        "users",
        "plan IN ('personal', 'family')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_plan", "users", type_="check")
    op.drop_column("users", "plan")
