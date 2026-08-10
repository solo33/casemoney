"""normalize and uniquely index user emails

Revision ID: aa10bb20cc30
Revises: 9a0b1c2d3e4f
"""

from alembic import op
import sqlalchemy as sa


revision = "aa10bb20cc30"
down_revision = "9a0b1c2d3e4f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Never guess which real account should survive if legacy data contains
    # case/whitespace variants of the same address.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM users
                GROUP BY lower(btrim(email))
                HAVING count(*) > 1
            ) THEN
                RAISE EXCEPTION 'Duplicate normalized user emails must be resolved before migration';
            END IF;
        END
        $$;
        """
    )
    op.execute("UPDATE users SET email = lower(btrim(email))")
    op.create_index(
        "uq_users_email_normalized",
        "users",
        [sa.text("lower(btrim(email))")],
        unique=True,
    )

    # Pending records do not own financial data. Keep the newest request when
    # old case variants exist, then enforce the same canonical uniqueness.
    op.execute(
        """
        DELETE FROM pending_registrations old
        USING pending_registrations newer
        WHERE lower(btrim(old.email)) = lower(btrim(newer.email))
          AND old.id < newer.id
        """
    )
    op.execute("UPDATE pending_registrations SET email = lower(btrim(email))")
    op.create_index(
        "uq_pending_registrations_email_normalized",
        "pending_registrations",
        [sa.text("lower(btrim(email))")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_pending_registrations_email_normalized", table_name="pending_registrations")
    op.drop_index("uq_users_email_normalized", table_name="users")
