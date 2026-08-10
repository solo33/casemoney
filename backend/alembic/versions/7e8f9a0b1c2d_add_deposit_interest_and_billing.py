"""add deposit interest and billing

Revision ID: 7e8f9a0b1c2d
Revises: 6d7e8f9a0b1c
"""

from alembic import op
import sqlalchemy as sa


revision = "7e8f9a0b1c2d"
down_revision = "6d7e8f9a0b1c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credit_obligations", sa.Column("annual_interest_rate", sa.Float(), nullable=True))
    op.add_column("credit_obligations", sa.Column("interest_payout_frequency", sa.String(length=16), nullable=True))
    op.add_column("credit_obligations", sa.Column("capitalization", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("credit_obligations", sa.Column("opened_at", sa.Date(), nullable=True))

    op.add_column("users", sa.Column("plan_source", sa.String(length=16), nullable=False, server_default="default"))
    op.add_column("users", sa.Column("plan_expires_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan", sa.String(length=16), nullable=False, server_default="family"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="yookassa"),
        sa.Column("provider_payment_method_id", sa.String(length=128), nullable=True),
        sa.Column("payment_method_title", sa.String(length=160), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_charge_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_payment_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"], unique=True)
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"], unique=False)
    op.create_index("ix_subscriptions_current_period_end", "subscriptions", ["current_period_end"], unique=False)
    op.create_index("ix_subscriptions_next_charge_at", "subscriptions", ["next_charge_at"], unique=False)

    op.create_table(
        "billing_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("subscription_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="yookassa"),
        sa.Column("provider_payment_id", sa.String(length=128), nullable=True),
        sa.Column("idempotence_key", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="initial"),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="RUB"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("confirmation_url", sa.Text(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotence_key"),
        sa.UniqueConstraint("provider_payment_id"),
    )
    op.create_index("ix_billing_payments_user_id", "billing_payments", ["user_id"], unique=False)
    op.create_index("ix_billing_payments_subscription_id", "billing_payments", ["subscription_id"], unique=False)
    op.create_index("ix_billing_payments_provider_payment_id", "billing_payments", ["provider_payment_id"], unique=True)
    op.create_index("ix_billing_payments_status", "billing_payments", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_billing_payments_status", table_name="billing_payments")
    op.drop_index("ix_billing_payments_provider_payment_id", table_name="billing_payments")
    op.drop_index("ix_billing_payments_subscription_id", table_name="billing_payments")
    op.drop_index("ix_billing_payments_user_id", table_name="billing_payments")
    op.drop_table("billing_payments")
    op.drop_index("ix_subscriptions_next_charge_at", table_name="subscriptions")
    op.drop_index("ix_subscriptions_current_period_end", table_name="subscriptions")
    op.drop_index("ix_subscriptions_status", table_name="subscriptions")
    op.drop_index("ix_subscriptions_user_id", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_column("users", "plan_expires_at")
    op.drop_column("users", "plan_source")
    op.drop_column("credit_obligations", "opened_at")
    op.drop_column("credit_obligations", "capitalization")
    op.drop_column("credit_obligations", "interest_payout_frequency")
    op.drop_column("credit_obligations", "annual_interest_rate")
