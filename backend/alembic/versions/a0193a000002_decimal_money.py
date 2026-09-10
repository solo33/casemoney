"""Store financial amounts and rates as exact PostgreSQL NUMERIC values."""
from alembic import op
import sqlalchemy as sa

revision = "a0193a000002"
down_revision = "a0193a000001"
branch_labels = None
depends_on = None

COLUMNS = {'account_balances': ['balance'],
 'budgets': ['amount', 'daily_amount'],
 'credit_obligations': ['original_amount',
                        'current_balance',
                        'credit_limit',
                        'monthly_payment',
                        'annual_interest_rate'],
 'credit_payments': ['amount', 'principal_amount', 'interest_amount', 'balance_after'],
 'exchange_rates': ['rate'],
 'family_settlements': ['amount'],
 'goals': ['target_amount', 'current_amount'],
 'goal_contributions': ['amount'],
 'recurring_transactions': ['amount', 'reimbursement_amount'],
 'shopping_items': ['quantity', 'planned_price', 'actual_price'],
 'transactions': ['amount',
                  'to_amount',
                  'exchange_rate',
                  'to_exchange_rate',
                  'fee_amount',
                  'reimbursement_amount'],
 'transaction_history': ['amount', 'prev_amount'],
 'transaction_templates': ['amount'],
 'user_currencies': ['manual_rate']}


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        raise RuntimeError("Money migration requires PostgreSQL precision guarantees")
    inspector = sa.inspect(bind)
    for table, columns in COLUMNS.items():
        # Names come only from the fixed migration inventory, never user input.
        keys = inspector.get_pk_constraint(table)["constrained_columns"]
        quote = bind.dialect.identifier_preparer.quote
        target = quote(table)
        names = [quote(column) for column in columns]
        key_names = [quote(key) for key in keys]
        invalid = " OR ".join(f"{name}::text IN ('NaN', 'Infinity', '-Infinity')" for name in names)
        if bind.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {target} WHERE {invalid})")).scalar():
            raise RuntimeError(f"Non-finite monetary values in {table}; no changes committed")
        snapshot = quote("money_snapshot_" + table)
        values = key_names + [f"{name}::text::numeric AS {name}" for name in names]
        bind.execute(sa.text(f"CREATE TEMP TABLE {snapshot} ON COMMIT DROP AS SELECT {', '.join(values)} FROM {target}"))
        for name in names:
            bind.execute(sa.text(f"ALTER TABLE {target} ALTER COLUMN {name} TYPE numeric USING {name}::text::numeric"))
        join = " AND ".join(f"original.{name} = changed.{name}" for name in key_names)
        mismatch = " OR ".join(f"original.{name} IS DISTINCT FROM changed.{name}" for name in names)
        if bind.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {snapshot} original JOIN {target} changed ON {join} WHERE {mismatch})")).scalar():
            raise RuntimeError(f"Monetary reconciliation failed for {table}; no changes committed")


def downgrade():
    bind = op.get_bind()
    quote = bind.dialect.identifier_preparer.quote
    for table, columns in COLUMNS.items():
        for column in columns:
            target, name = quote(table), quote(column)
            mismatch = f"{name}::double precision::text::numeric IS DISTINCT FROM {name}"
            if bind.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {target} WHERE {mismatch})")).scalar():
                raise RuntimeError(f"Cannot downgrade {table}.{column} without losing precision")
            bind.execute(sa.text(f"ALTER TABLE {target} ALTER COLUMN {name} TYPE double precision USING {name}::double precision"))
