"""Finish legacy Family backfill before making accounting queries read-only."""
from alembic import op

revision = "a0193a000001"
down_revision = "ff1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade():
    # Only infer ownership when the active family is unambiguous.
    op.execute("""
        UPDATE transactions AS t SET family_id = membership.family_id
        FROM (
            SELECT user_id, min(family_id) AS family_id FROM family_members
            WHERE status = 'active' AND user_id IS NOT NULL
            GROUP BY user_id HAVING count(DISTINCT family_id) = 1
        ) AS membership
        WHERE t.user_id = membership.user_id AND t.family_id IS NULL
          AND t.is_family_expense = true AND t.type = 'expense'
          AND t.is_planned = false
    """)
    op.execute("""
        INSERT INTO family_expense_accounting (
            family_id, source_transaction_id, source_user_id, owner_user_id,
            source_category_id, owner_category_id, status, accepted_at
        )
        SELECT t.family_id, t.id, t.user_id, f.owner_user_id, t.category_id,
            CASE WHEN t.user_id = f.owner_user_id THEN t.category_id END,
            CASE WHEN t.user_id = f.owner_user_id THEN 'accepted' ELSE 'pending' END,
            CASE WHEN t.user_id = f.owner_user_id THEN now() END
        FROM transactions t JOIN families f ON f.id = t.family_id
        WHERE t.is_family_expense = true AND t.type = 'expense'
          AND t.is_planned = false
        ON CONFLICT (source_transaction_id) DO NOTHING
    """)


def downgrade():
    # Preserve repaired data and subsequent user accounting decisions.
    pass
