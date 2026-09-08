"""Durable, idempotent import previews shared between application workers."""
from alembic import op
import sqlalchemy as sa

revision = "ff1a2b3c4d5e"
down_revision = "fe0a1b2c3d4e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("import_sessions",
        sa.Column("token", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.Float(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("confirmation", sa.JSON(), nullable=True))
    op.create_index("ix_import_sessions_user_id", "import_sessions", ["user_id"])
    op.create_index("ix_import_sessions_expires_at", "import_sessions", ["expires_at"])


def downgrade():
    op.drop_table("import_sessions")
