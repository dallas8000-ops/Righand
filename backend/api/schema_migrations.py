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
