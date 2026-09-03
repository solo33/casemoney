"""backfill family expense accounting

Revision ID: fd3e4f5a6b7c
Revises: fc2d3e4f5a6b
Create Date: 2026-09-03
"""

from typing import Sequence, Union

from alembic import op


revision: str = "fd3e4f5a6b7c"
down_revision: Union[str, Sequence[str], None] = "fc2d3e4f5a6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The accounting queue was added after Family expenses had already been
    # used in production.  Without these rows historic owner purchases were
    # silently absent from Family analytics.  Purchases made by other members
    # stay pending, preserving the explicit owner-confirmation workflow.
    op.execute("""
        INSERT INTO family_expense_accounting (
            family_id, source_transaction_id, source_user_id, owner_user_id,
            source_category_id, owner_category_id, status, accepted_at
        )
        SELECT
            t.family_id,
            t.id,
            t.user_id,
            f.owner_user_id,
            t.category_id,
            CASE WHEN t.user_id = f.owner_user_id THEN t.category_id ELSE NULL END,
            CASE WHEN t.user_id = f.owner_user_id THEN 'accepted' ELSE 'pending' END,
            CASE WHEN t.user_id = f.owner_user_id THEN now() ELSE NULL END
        FROM transactions AS t
        JOIN families AS f ON f.id = t.family_id
        WHERE t.is_family_expense = true
          AND t.type = 'expense'
          AND t.is_planned = false
        ON CONFLICT (source_transaction_id) DO NOTHING
    """)


def downgrade() -> None:
    # This is a one-way production data repair.  Removing the generated rows
    # on downgrade would also discard accounting decisions made by users.
    pass
