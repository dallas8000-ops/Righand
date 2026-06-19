"""Lightweight schema migrations for existing databases."""

from django.db import connection


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

CREATE_LOAD_PACKETS = """
CREATE TABLE IF NOT EXISTS load_packets (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'planned',
    load_number VARCHAR(80),
    broker VARCHAR(120),
    shipper VARCHAR(160),
    receiver VARCHAR(160),
    pickup_date DATE,
    delivery_date DATE,
    rate FLOAT,
    loaded_miles FLOAT,
    deadhead_miles FLOAT,
    fuel_estimate FLOAT,
    tolls FLOAT,
    detention_terms TEXT,
    lumper FLOAT,
    pickup_address TEXT,
    delivery_address TEXT,
    notes TEXT,
    contract_url TEXT,
    bol_url TEXT,
    pod_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_MAINTENANCE_ITEMS = """
CREATE TABLE IF NOT EXISTS maintenance_items (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(120) NOT NULL,
    due_odometer FLOAT,
    due_date DATE,
    last_completed_odometer FLOAT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""


def _table_names():
    with connection.cursor() as cursor:
        tables = connection.introspection.table_names(cursor)
    return set(tables)


def _column_names(table):
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table)
    return {col.name for col in description}


def run_migrations():
    tables = _table_names()

    if 'expenses' in tables:
        existing = _column_names('expenses')
        with connection.cursor() as cursor:
            for column, col_type in EXPENSE_COLUMNS.items():
                if column not in existing:
                    cursor.execute(f'ALTER TABLE expenses ADD COLUMN {column} {col_type}')

    if 'subscriptions' in tables:
        sub_cols = _column_names('subscriptions')
        if 'tier' not in sub_cols:
            with connection.cursor() as cursor:
                if 'purchase_events' in tables:
                    cursor.execute('DROP TABLE purchase_events')
                cursor.execute('DROP TABLE subscriptions')

    with connection.cursor() as cursor:
        cursor.execute(CREATE_LOAD_PACKETS)
        cursor.execute(CREATE_MAINTENANCE_ITEMS)
        cursor.execute('CREATE INDEX IF NOT EXISTS ix_load_packets_user_id ON load_packets (user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS ix_maintenance_items_user_id ON maintenance_items (user_id)')
