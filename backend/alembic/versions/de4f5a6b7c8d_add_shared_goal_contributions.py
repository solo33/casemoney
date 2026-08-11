"""add shared goal contributions

Revision ID: de4f5a6b7c8d
Revises: cd3e4f5a6b7c
"""
from alembic import op
import sqlalchemy as sa

revision = "de4f5a6b7c8d"
down_revision = "cd3e4f5a6b7c"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("goals", sa.Column("family_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_goals_family_id", "goals", "families", ["family_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_goals_family_id", "goals", ["family_id"])
    op.create_table("goal_contributions", sa.Column("id", sa.Integer(), nullable=False), sa.Column("goal_id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("amount", sa.Float(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_goal_contributions_goal_id", "goal_contributions", ["goal_id"])

def downgrade() -> None:
    op.drop_index("ix_goal_contributions_goal_id", table_name="goal_contributions")
    op.drop_table("goal_contributions")
    op.drop_index("ix_goals_family_id", table_name="goals")
    op.drop_constraint("fk_goals_family_id", "goals", type_="foreignkey")
    op.drop_column("goals", "family_id")
