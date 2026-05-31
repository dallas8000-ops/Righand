"""Lightweight schema migrations for existing databases."""
from sqlalchemy import inspect, text


EXPENSE_COLUMNS = {
    'miles': 'FLOAT',
    'gallons': 'FLOAT',
    'odometer': 'FLOAT',
    'deadhead_miles': 'FLOAT',
    'tolls_amount': 'FLOAT',
    'fuel_cost_alloc': 'FLOAT',
    'receipt_url': 'TEXT',
    'broker': 'VARCHAR(120)',
    'customer': 'VARCHAR(120)',
    'fuel_state': 'VARCHAR(2)',
}


def run_migrations(db):
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()

    if 'expenses' in tables:
        existing = {c['name'] for c in inspector.get_columns('expenses')}
        for column, col_type in EXPENSE_COLUMNS.items():
            if column not in existing:
                db.session.execute(
                    text(f'ALTER TABLE expenses ADD COLUMN {column} {col_type}')
                )
        db.session.commit()

    # Replace legacy subscriptions schema (plan/status) with tier-based model
    if 'subscriptions' in tables:
        sub_cols = {c['name'] for c in inspector.get_columns('subscriptions')}
        if 'tier' not in sub_cols:
            if 'purchase_events' in tables:
                db.session.execute(text('DROP TABLE purchase_events'))
            db.session.execute(text('DROP TABLE subscriptions'))
            db.session.commit()
