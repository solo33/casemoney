"""add shared shopping lists

Revision ID: ef5a6b7c8d9e
Revises: de4f5a6b7c8d
"""
from alembic import op
import sqlalchemy as sa

revision = "ef5a6b7c8d9e"
down_revision = "de4f5a6b7c8d"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("shopping_lists", sa.Column("family_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_shopping_lists_family_id", "shopping_lists", "families", ["family_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_shopping_lists_family_id", "shopping_lists", ["family_id"])

def downgrade() -> None:
    op.drop_index("ix_shopping_lists_family_id", table_name="shopping_lists")
    op.drop_constraint("fk_shopping_lists_family_id", "shopping_lists", type_="foreignkey")
    op.drop_column("shopping_lists", "family_id")
