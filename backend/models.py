from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone

db = SQLAlchemy()


def _utcnow():
    return datetime.now(timezone.utc)

class User(db.Model):
    """User model for truck drivers"""
    __tablename__ = 'users'
    
    id = db.Column(db.String(50), primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    trucker_license = db.Column(db.String(50), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    expenses = db.relationship('Expense', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'truckerLicense': self.trucker_license,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat()
        }

class Expense(db.Model):
    """Expense tracking model"""
    __tablename__ = 'expenses'
    
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False, index=True)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)  # fuel, maintenance, tolls, food, other, load
    expense_type = db.Column(db.String(20), nullable=False, default='expense')  # expense or income
    expense_date = db.Column(db.Date, nullable=False, index=True)
    notes = db.Column(db.Text)
    miles = db.Column(db.Float)
    gallons = db.Column(db.Float)
    odometer = db.Column(db.Float)
    deadhead_miles = db.Column(db.Float)
    tolls_amount = db.Column(db.Float)
    fuel_cost_alloc = db.Column(db.Float)
    receipt_url = db.Column(db.Text)
    broker = db.Column(db.String(120))
    customer = db.Column(db.String(120))
    fuel_state = db.Column(db.String(2))
    is_synced = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        load_profit = None
        load_profit_per_mile = None
        if self.expense_type == 'income' and self.category == 'load':
            deductions = (self.fuel_cost_alloc or 0) + (self.tolls_amount or 0)
            load_profit = self.amount - deductions
            if self.miles and self.miles > 0:
                load_profit_per_mile = load_profit / self.miles

        return {
            'id': self.id,
            'userId': self.user_id,
            'description': self.description,
            'amount': self.amount,
            'category': self.category,
            'type': self.expense_type,
            'date': self.expense_date.isoformat(),
            'notes': self.notes,
            'miles': self.miles,
            'gallons': self.gallons,
            'odometer': self.odometer,
            'deadheadMiles': self.deadhead_miles,
            'tollsAmount': self.tolls_amount,
            'fuelCostAlloc': self.fuel_cost_alloc,
            'receiptUrl': self.receipt_url,
            'broker': self.broker,
            'customer': self.customer,
            'fuelState': self.fuel_state,
            'loadProfit': load_profit,
            'loadProfitPerMile': load_profit_per_mile,
            'synced': self.is_synced,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat()
        }


class UserCategory(db.Model):
    """Per-user custom expense/income categories"""
    __tablename__ = 'user_categories'

    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False, index=True)
    value = db.Column(db.String(50), nullable=False)
    label = db.Column(db.String(80), nullable=False)
    entry_type = db.Column(db.String(20), default='expense')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'value': self.value,
            'label': self.label,
            'entryType': self.entry_type,
            'createdAt': self.created_at.isoformat()
        }


class Tenant(db.Model):
    """Fleet carrier / organization (Tier B)"""
    __tablename__ = 'tenants'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    dot_number = db.Column(db.String(20))
    owner_user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False)
    max_drivers = db.Column(db.Integer, default=5)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    memberships = db.relationship('FleetMembership', backref='tenant', lazy=True)


class FleetMembership(db.Model):
    """Links users to a fleet with a role"""
    __tablename__ = 'fleet_memberships'

    id = db.Column(db.String(50), primary_key=True)
    tenant_id = db.Column(db.String(50), db.ForeignKey('tenants.id'), nullable=False, index=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False, default='driver')  # owner, dispatcher, driver
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class DutyLog(db.Model):
    """HOS lite duty status events (Tier B)"""
    __tablename__ = 'duty_logs'

    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False, index=True)
    status = db.Column(db.String(30), nullable=False)  # OFF_DUTY, SLEEPER, DRIVING, ON_DUTY
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime)
    notes = db.Column(db.Text)


class VehicleLocation(db.Model):
    """Latest GPS ping per user (Tier B live map)"""
    __tablename__ = 'vehicle_locations'

    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    tenant_id = db.Column(db.String(50), db.ForeignKey('tenants.id'), index=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    speed = db.Column(db.Float, default=0)
    heading = db.Column(db.Float)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)


class Subscription(db.Model):
    """One row per user — current tier, pricing phase, and milestones."""
    __tablename__ = 'subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), unique=True, nullable=False)

    subscriber_id = db.Column(db.String(20), unique=True, nullable=False)

    tier = db.Column(db.String(20), default='free')  # free | pro | fleet
    started_at = db.Column(db.DateTime(timezone=True), default=_utcnow)
    pro_started_at = db.Column(db.DateTime(timezone=True), nullable=True)

    free_updates_used = db.Column(db.Integer, default=0)
    milestone_notified = db.Column(db.Boolean, default=False)

    events = db.relationship('PurchaseEvent', backref='subscription', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'subscriberId': self.subscriber_id,
            'tier': self.tier,
            'active': self.tier in ('pro', 'fleet'),
            'startedAt': self.started_at.isoformat() if self.started_at else None,
            'proStartedAt': self.pro_started_at.isoformat() if self.pro_started_at else None,
            'freeUpdatesUsed': self.free_updates_used,
            'milestoneNotified': self.milestone_notified,
        }

    def __repr__(self):
        return f'<Subscription {self.subscriber_id} tier={self.tier}>'


class PurchaseEvent(db.Model):
    """Append-only log of every purchase, upgrade, and cancellation."""
    __tablename__ = 'purchase_events'

    id = db.Column(db.Integer, primary_key=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey('subscriptions.id'), nullable=False)
    subscriber_id = db.Column(db.String(20), nullable=False)

    event_type = db.Column(db.String(30), nullable=False)  # purchase | upgrade | downgrade | cancel | renew
    tier = db.Column(db.String(20), nullable=False)
    amount = db.Column(db.Float, default=0.0)

    google_order_id = db.Column(db.String(100), nullable=True)
    google_product_id = db.Column(db.String(100), nullable=True)

    occurred_at = db.Column(db.DateTime(timezone=True), default=_utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'subscriptionId': self.subscription_id,
            'subscriberId': self.subscriber_id,
            'eventType': self.event_type,
            'tier': self.tier,
            'amount': self.amount,
            'googleOrderId': self.google_order_id,
            'googleProductId': self.google_product_id,
            'occurredAt': self.occurred_at.isoformat() if self.occurred_at else None,
        }

    def __repr__(self):
        return f'<PurchaseEvent {self.subscriber_id} {self.event_type} ${self.amount}>'


class SyncLog(db.Model):
    """Track sync operations for audit"""
    __tablename__ = 'sync_logs'
    
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False, index=True)
    action = db.Column(db.String(50), nullable=False)  # CREATE, UPDATE, DELETE
    entity_type = db.Column(db.String(50), nullable=False)  # EXPENSE, etc
    entity_id = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), default='success')  # success, failed
    error_message = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'action': self.action,
            'entityType': self.entity_type,
            'entityId': self.entity_id,
            'status': self.status,
            'errorMessage': self.error_message,
            'createdAt': self.created_at.isoformat()
        }
