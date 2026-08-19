"""Lightweight schema migrations for existing databases."""

import logging

from django.db import connection

logger = logging.getLogger(__name__)

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

COMPLIANCE_DOCUMENT_COLUMNS = {
    'extracted_fields': 'TEXT',
}

ADD_COLUMN_SQL = {
    'expenses': {
        'miles': 'ALTER TABLE expenses ADD COLUMN miles FLOAT',
        'gallons': 'ALTER TABLE expenses ADD COLUMN gallons FLOAT',
        'odometer': 'ALTER TABLE expenses ADD COLUMN odometer FLOAT',
        'deadhead_miles': 'ALTER TABLE expenses ADD COLUMN deadhead_miles FLOAT',
        'tolls_amount': 'ALTER TABLE expenses ADD COLUMN tolls_amount FLOAT',
        'fuel_cost_alloc': 'ALTER TABLE expenses ADD COLUMN fuel_cost_alloc FLOAT',
        'receipt_url': 'ALTER TABLE expenses ADD COLUMN receipt_url TEXT',
        'broker': 'ALTER TABLE expenses ADD COLUMN broker VARCHAR(120)',
        'customer': 'ALTER TABLE expenses ADD COLUMN customer VARCHAR(120)',
        'fuel_state': 'ALTER TABLE expenses ADD COLUMN fuel_state VARCHAR(2)',
    },
    'compliance_documents': {
        'extracted_fields': 'ALTER TABLE compliance_documents ADD COLUMN extracted_fields TEXT',
    },
}

CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(120) NOT NULL,
    trucker_license VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_EXPENSES = """
CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    category VARCHAR(50) NOT NULL,
    expense_type VARCHAR(20) NOT NULL,
    expense_date DATE NOT NULL,
    notes TEXT,
    miles DOUBLE PRECISION,
    gallons DOUBLE PRECISION,
    odometer DOUBLE PRECISION,
    deadhead_miles DOUBLE PRECISION,
    tolls_amount DOUBLE PRECISION,
    fuel_cost_alloc DOUBLE PRECISION,
    receipt_url TEXT,
    broker VARCHAR(120),
    customer VARCHAR(120),
    fuel_state VARCHAR(2),
    is_synced BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_USER_CATEGORIES = """
CREATE TABLE IF NOT EXISTS user_categories (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    value VARCHAR(50) NOT NULL,
    label VARCHAR(80) NOT NULL,
    entry_type VARCHAR(20) DEFAULT 'expense',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_TENANTS = """
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    dot_number VARCHAR(20),
    owner_user_id VARCHAR(50) NOT NULL,
    max_drivers INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_FLEET_MEMBERSHIPS = """
CREATE TABLE IF NOT EXISTS fleet_memberships (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    role VARCHAR(20) DEFAULT 'driver',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_DUTY_LOGS = """
CREATE TABLE IF NOT EXISTS duty_logs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    notes TEXT
)
"""

CREATE_VEHICLE_LOCATIONS = """
CREATE TABLE IF NOT EXISTS vehicle_locations (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL UNIQUE,
    tenant_id VARCHAR(50),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION DEFAULT 0,
    heading DOUBLE PRECISION,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_SYNC_LOGS = """
CREATE TABLE IF NOT EXISTS sync_logs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

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
    rate DOUBLE PRECISION,
    loaded_miles DOUBLE PRECISION,
    deadhead_miles DOUBLE PRECISION,
    fuel_estimate DOUBLE PRECISION,
    tolls DOUBLE PRECISION,
    detention_terms TEXT,
    lumper DOUBLE PRECISION,
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
    due_odometer DOUBLE PRECISION,
    due_date DATE,
    last_completed_odometer DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_COMPLIANCE_DOCUMENTS = """
CREATE TABLE IF NOT EXISTS compliance_documents (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    jurisdiction_code VARCHAR(10) NOT NULL,
    jurisdiction_label VARCHAR(120) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120),
    extracted_text TEXT,
    extracted_fields TEXT,
    summary TEXT,
    scan_status VARCHAR(30) DEFAULT 'reviewed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_COMPLIANCE_FINDINGS = """
CREATE TABLE IF NOT EXISTS compliance_findings (
    id VARCHAR(50) PRIMARY KEY,
    document_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    jurisdiction_code VARCHAR(10) NOT NULL,
    rule_id VARCHAR(80) NOT NULL,
    title VARCHAR(160) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    finding_type VARCHAR(30) DEFAULT 'required',
    detail TEXT,
    matched_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_COMPLIANCE_PROFILES = """
CREATE TABLE IF NOT EXISTS compliance_profiles (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    profile_type VARCHAR(30) NOT NULL,
    jurisdiction_code VARCHAR(10) NOT NULL,
    title VARCHAR(160) NOT NULL,
    data_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""


def _subscriptions_create_sql():
    if connection.vendor == 'postgresql':
        return """
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL UNIQUE REFERENCES users(id),
    subscriber_id VARCHAR(20) NOT NULL UNIQUE,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pro_started_at TIMESTAMP,
    free_updates_used INTEGER NOT NULL DEFAULT 0,
    milestone_notified BOOLEAN NOT NULL DEFAULT FALSE
)
"""
    return """
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
"""


def _purchase_events_create_sql():
    if connection.vendor == 'postgresql':
        return """
CREATE TABLE IF NOT EXISTS purchase_events (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    subscriber_id VARCHAR(20) NOT NULL,
    event_type VARCHAR(30) NOT NULL,
    tier VARCHAR(20) NOT NULL,
    amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    google_order_id VARCHAR(100),
    google_product_id VARCHAR(100),
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""
    return """
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
"""


def _table_names():
    with connection.cursor() as cursor:
        tables = connection.introspection.table_names(cursor)
    return set(tables)


def _column_names(table):
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table)
    return {col.name for col in description}

def _add_missing_columns(table, columns):
    existing = _column_names(table)
    with connection.cursor() as cursor:
        for column in columns:
            if column in existing:
                continue
            cursor.execute(ADD_COLUMN_SQL[table][column])


def ensure_core_schema():
    """Create application tables on a fresh database (models are unmanaged)."""
    statements = [
        CREATE_USERS,
        CREATE_EXPENSES,
        CREATE_USER_CATEGORIES,
        CREATE_TENANTS,
        CREATE_FLEET_MEMBERSHIPS,
        CREATE_DUTY_LOGS,
        CREATE_VEHICLE_LOCATIONS,
        CREATE_SYNC_LOGS,
        CREATE_LOAD_PACKETS,
        CREATE_MAINTENANCE_ITEMS,
        CREATE_COMPLIANCE_DOCUMENTS,
        CREATE_COMPLIANCE_FINDINGS,
        CREATE_COMPLIANCE_PROFILES,
        _subscriptions_create_sql(),
        _purchase_events_create_sql(),
        'CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)',
        'CREATE INDEX IF NOT EXISTS ix_expenses_user_id ON expenses (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_expenses_expense_date ON expenses (expense_date)',
        'CREATE INDEX IF NOT EXISTS ix_user_categories_user_id ON user_categories (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_fleet_memberships_tenant_id ON fleet_memberships (tenant_id)',
        'CREATE INDEX IF NOT EXISTS ix_fleet_memberships_user_id ON fleet_memberships (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_duty_logs_user_id ON duty_logs (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_vehicle_locations_tenant_id ON vehicle_locations (tenant_id)',
        'CREATE INDEX IF NOT EXISTS ix_sync_logs_user_id ON sync_logs (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_load_packets_user_id ON load_packets (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_maintenance_items_user_id ON maintenance_items (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_compliance_documents_user_id ON compliance_documents (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_compliance_documents_jurisdiction ON compliance_documents (jurisdiction_code)',
        'CREATE INDEX IF NOT EXISTS ix_compliance_findings_document_id ON compliance_findings (document_id)',
        'CREATE INDEX IF NOT EXISTS ix_compliance_findings_user_id ON compliance_findings (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_compliance_profiles_user_id ON compliance_profiles (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_compliance_profiles_type ON compliance_profiles (profile_type)',
        'CREATE INDEX IF NOT EXISTS ix_compliance_profiles_jurisdiction ON compliance_profiles (jurisdiction_code)',
        'CREATE INDEX IF NOT EXISTS ix_purchase_events_subscriber_id ON purchase_events (subscriber_id)',
    ]
    with connection.cursor() as cursor:
        for sql in statements:
            cursor.execute(sql)
    logger.info('Application schema ensured (%s)', connection.vendor)


def run_migrations():
    ensure_core_schema()

    tables = _table_names()

    if 'expenses' in tables:
        _add_missing_columns('expenses', EXPENSE_COLUMNS)

    if 'subscriptions' in tables:
        sub_cols = _column_names('subscriptions')
        if 'tier' not in sub_cols:
            with connection.cursor() as cursor:
                if 'purchase_events' in tables:
                    cursor.execute('DROP TABLE purchase_events')
                cursor.execute('DROP TABLE subscriptions')
                cursor.execute(_subscriptions_create_sql())
                cursor.execute(_purchase_events_create_sql())

    if 'compliance_documents' in tables:
        _add_missing_columns('compliance_documents', COMPLIANCE_DOCUMENT_COLUMNS)
