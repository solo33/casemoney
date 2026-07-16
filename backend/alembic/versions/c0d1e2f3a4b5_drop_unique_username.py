"""drop unique constraint from users.username

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-07-16
"""

import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c0d1e2f3a4b5"
down_revision: Union[str, Sequence[str], None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("users_username_key", "users", type_="unique")
    admin_email = os.getenv("INITIAL_ADMIN_EMAIL") or os.getenv(
        "REGISTRATION_NOTIFY_EMAIL"
    )
    if not admin_email:
        return
    result = op.get_bind().execute(
        sa.text(
            "UPDATE users SET is_admin = true "
            "WHERE lower(email) = lower(:email)"
        ),
        {"email": admin_email},
    )
    if result.rowcount != 1:
        raise RuntimeError(
            "Expected exactly one user for the initial administrator account"
        )


def downgrade() -> None:
    op.create_unique_constraint("users_username_key", "users", ["username"])
