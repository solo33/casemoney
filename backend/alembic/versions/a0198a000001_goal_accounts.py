"""Allow several accounts per goal, preserving existing single-account links."""
from alembic import op
import sqlalchemy as sa

revision = "a0198a000001"
down_revision = "a0193a000002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "goal_accounts",
        sa.Column("goal_id", sa.Integer(), sa.ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True),
    )
    op.execute("INSERT INTO goal_accounts (goal_id, account_id) SELECT id, account_id FROM goals WHERE account_id IS NOT NULL")


def downgrade():
    # Keep one surviving link for older application versions.
    op.execute("UPDATE goals SET account_id = (SELECT MIN(account_id) FROM goal_accounts WHERE goal_id = goals.id) WHERE EXISTS (SELECT 1 FROM goal_accounts WHERE goal_id = goals.id)")
    op.drop_table("goal_accounts")
