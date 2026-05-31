"""Run once to add subscription tables. Usage: python migrate_subscriptions.py"""

import os
import sqlite3

DB_PATH = os.environ.get('DB_PATH', 'righand.db')


def _table_columns(cursor, table):
    cursor.execute(f'PRAGMA table_info({table})')
    return {row[1] for row in cursor.fetchall()}


def migrate():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Replace legacy subscriptions schema (plan/status columns) if present
    if 'subscriptions' in {r[0] for r in c.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()}:
        cols = _table_columns(c, 'subscriptions')
        if 'tier' not in cols:
            c.execute('DROP TABLE IF EXISTS subscriptions')

    c.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
            subscriber_id TEXT NOT NULL UNIQUE,
            tier TEXT NOT NULL DEFAULT 'free',
            started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            pro_started_at TIMESTAMP,
            free_updates_used INTEGER NOT NULL DEFAULT 0,
            milestone_notified BOOLEAN NOT NULL DEFAULT 0
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS purchase_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
            subscriber_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            tier TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0.0,
            google_order_id TEXT,
            google_product_id TEXT,
            occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute(
        'CREATE INDEX IF NOT EXISTS ix_purchase_events_subscriber_id '
        'ON purchase_events (subscriber_id)'
    )

    conn.commit()
    conn.close()
    print('Subscription tables created successfully.')


if __name__ == '__main__':
    migrate()
