from django.db import models


class User(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    email = models.EmailField(max_length=120, unique=True, db_index=True)
    password_hash = models.CharField(max_length=255)
    name = models.CharField(max_length=120)
    trucker_license = models.CharField(max_length=50, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'
        managed = False

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'truckerLicense': self.trucker_license,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat(),
        }


class Expense(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    user_id = models.CharField(max_length=50, db_index=True)
    description = models.CharField(max_length=255)
    amount = models.FloatField()
    category = models.CharField(max_length=50)
    expense_type = models.CharField(max_length=20)
    expense_date = models.DateField(db_index=True)
    notes = models.TextField(null=True, blank=True)
    miles = models.FloatField(null=True, blank=True)
    gallons = models.FloatField(null=True, blank=True)
    odometer = models.FloatField(null=True, blank=True)
    deadhead_miles = models.FloatField(null=True, blank=True)
    tolls_amount = models.FloatField(null=True, blank=True)
    fuel_cost_alloc = models.FloatField(null=True, blank=True)
    receipt_url = models.TextField(null=True, blank=True)
    broker = models.CharField(max_length=120, null=True, blank=True)
    customer = models.CharField(max_length=120, null=True, blank=True)
    fuel_state = models.CharField(max_length=2, null=True, blank=True)
    is_synced = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'expenses'
        managed = False

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
            'updatedAt': self.updated_at.isoformat(),
        }


class UserCategory(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    user_id = models.CharField(max_length=50, db_index=True)
    value = models.CharField(max_length=50)
    label = models.CharField(max_length=80)
    entry_type = models.CharField(max_length=20, default='expense')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_categories'
        managed = False

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'value': self.value,
            'label': self.label,
            'entryType': self.entry_type,
            'createdAt': self.created_at.isoformat(),
        }


class Tenant(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    name = models.CharField(max_length=120)
    dot_number = models.CharField(max_length=20, null=True, blank=True)
    owner_user_id = models.CharField(max_length=50)
    max_drivers = models.IntegerField(default=5)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tenants'
        managed = False


class FleetMembership(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    tenant_id = models.CharField(max_length=50, db_index=True)
    user_id = models.CharField(max_length=50, db_index=True)
    role = models.CharField(max_length=20, default='driver')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fleet_memberships'
        managed = False


class DutyLog(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    user_id = models.CharField(max_length=50, db_index=True)
    status = models.CharField(max_length=30)
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'duty_logs'
        managed = False


class VehicleLocation(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    user_id = models.CharField(max_length=50, unique=True, db_index=True)
    tenant_id = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    speed = models.FloatField(default=0)
    heading = models.FloatField(null=True, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'vehicle_locations'
        managed = False


class Subscription(models.Model):
    id = models.AutoField(primary_key=True)
    user_id = models.CharField(max_length=50, unique=True)
    subscriber_id = models.CharField(max_length=20, unique=True)
    tier = models.CharField(max_length=20, default='free')
    started_at = models.DateTimeField()
    pro_started_at = models.DateTimeField(null=True, blank=True)
    free_updates_used = models.IntegerField(default=0)
    milestone_notified = models.BooleanField(default=False)

    class Meta:
        db_table = 'subscriptions'
        managed = False

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


class PurchaseEvent(models.Model):
    id = models.AutoField(primary_key=True)
    subscription_id = models.IntegerField()
    subscriber_id = models.CharField(max_length=20)
    event_type = models.CharField(max_length=30)
    tier = models.CharField(max_length=20)
    amount = models.FloatField(default=0.0)
    google_order_id = models.CharField(max_length=100, null=True, blank=True)
    google_product_id = models.CharField(max_length=100, null=True, blank=True)
    occurred_at = models.DateTimeField()

    class Meta:
        db_table = 'purchase_events'
        managed = False

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


class SyncLog(models.Model):
    id = models.CharField(max_length=50, primary_key=True)
    user_id = models.CharField(max_length=50, db_index=True)
    action = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=50)
    entity_id = models.CharField(max_length=50)
    status = models.CharField(max_length=20, default='success')
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sync_logs'
        managed = False

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'action': self.action,
            'entityType': self.entity_type,
            'entityId': self.entity_id,
            'status': self.status,
            'errorMessage': self.error_message,
            'createdAt': self.created_at.isoformat(),
        }
