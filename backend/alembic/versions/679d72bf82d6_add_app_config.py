"""add_app_config

Revision ID: 679d72bf82d6
Revises: e709f63784d6
Create Date: 2026-05-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "679d72bf82d6"
down_revision: Union[str, Sequence[str], None] = "e709f63784d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("require_email_verification", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # Вставляем дефолтную запись с id=1
    op.execute("INSERT INTO app_config (id, require_email_verification) VALUES (1, true)")


def downgrade() -> None:
    op.drop_table("app_config")
