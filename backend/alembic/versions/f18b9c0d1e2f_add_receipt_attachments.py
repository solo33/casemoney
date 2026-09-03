"""retain receipt migration revision after receipt feature removal

Revision ID: f18b9c0d1e2f
Revises: f17a8b9c0d1f
Create Date: 2026-08-24

The receipt-upload feature was deliberately removed before release.  The
revision stays in history as a no-op so existing installations keep a valid
Alembic chain and can receive subsequent migrations.
"""

from typing import Sequence, Union


revision: str = "f18b9c0d1e2f"
down_revision: Union[str, Sequence[str], None] = "f17a8b9c0d1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
