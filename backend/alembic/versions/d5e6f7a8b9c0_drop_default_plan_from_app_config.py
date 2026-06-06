"""drop default_plan / default_premium_days from app_config

Plans were collapsed into a single "Personal" plan, so the per-config
default plan settings are no longer used.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-06-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("app_config", "default_premium_days")
    op.drop_column("app_config", "default_plan")


def downgrade() -> None:
    op.add_column(
        "app_config",
        sa.Column("default_plan", sa.String(length=10), nullable=False, server_default="free"),
    )
    op.add_column(
        "app_config",
        sa.Column("default_premium_days", sa.Integer(), nullable=False, server_default="0"),
    )
