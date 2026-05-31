"""Fleet Lite provisioning (used by setup_fleet CLI and paid Fleet upgrades)."""

import uuid

from models import db, User, Tenant, FleetMembership


def ensure_fleet_for_owner(owner: User, fleet_name: str = None, max_drivers: int = 5) -> Tenant:
    """Create fleet + owner membership if the user is not already in a fleet."""
    existing = FleetMembership.query.filter_by(user_id=owner.id).first()
    if existing:
        return Tenant.query.get(existing.tenant_id)

    name = fleet_name or f'{owner.name or owner.email.split("@")[0]} Fleet'
    tenant = Tenant(
        id=str(uuid.uuid4()),
        name=name,
        owner_user_id=owner.id,
        max_drivers=max_drivers,
    )
    membership = FleetMembership(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        user_id=owner.id,
        role='owner',
    )
    db.session.add(tenant)
    db.session.add(membership)
    db.session.flush()
    return tenant
