"""expand budgets with periods and rollover

Revision ID: a93b2c4d5e6f
Revises: a82b1c3d4e5f
Create Date: 2026-08-13
"""

from alembic import op
import sqlalchemy as sa


revision = "a93b2c4d5e6f"
down_revision = "a82b1c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("period_start", sa.Date(), nullable=True))
    op.execute("UPDATE budgets SET period_start = date_trunc('month', CURRENT_DATE)::date WHERE period_start IS NULL")
    op.alter_column("budgets", "period_start", nullable=False)
    op.add_column(
        "budgets",
        sa.Column("rollover_mode", sa.String(length=24), nullable=False, server_default="none"),
    )
    op.add_column(
        "budgets",
        sa.Column("include_planned", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "budgets",
        sa.Column("scope", sa.String(length=16), nullable=False, server_default="personal"),
    )
    op.drop_constraint("uq_budgets_user_category_period", "budgets", type_="unique")
    op.create_unique_constraint(
        "uq_budgets_user_category_period_start",
        "budgets",
        ["user_id", "category_id", "period", "period_start"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_budgets_user_category_period_start", "budgets", type_="unique")
    op.create_unique_constraint(
        "uq_budgets_user_category_period",
        "budgets",
        ["user_id", "category_id", "period"],
    )
    op.drop_column("budgets", "scope")
    op.drop_column("budgets", "include_planned")
    op.drop_column("budgets", "rollover_mode")
    op.drop_column("budgets", "period_start")
