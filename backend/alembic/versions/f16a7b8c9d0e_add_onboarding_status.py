"""add onboarding status

Revision ID: f16a7b8c9d0e
Revises: f05a6b7c8d9e
"""
from alembic import op
import sqlalchemy as sa

revision = "f16a7b8c9d0e"
down_revision = "f05a6b7c8d9e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()))
    # Existing people already know the product; the guided tour is for new registrations.
    op.execute("UPDATE users SET onboarding_completed = true")


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed")
