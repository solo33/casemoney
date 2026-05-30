"""add_email_verified_to_user

Revision ID: e709f63784d6
Revises: 10f72171354c
Create Date: 2026-05-30

Существующих юзеров считаем верифицированными (backward compat),
новых — нет (по умолчанию False).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "e709f63784d6"
down_revision: Union[str, Sequence[str], None] = "10f72171354c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Колонка с дефолтом true, чтобы существующие юзеры стали verified
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()))
    # 2. Меняем дефолт на false для будущих новых строк
    op.alter_column("users", "email_verified", server_default=sa.false())


def downgrade() -> None:
    op.drop_column("users", "email_verified")
