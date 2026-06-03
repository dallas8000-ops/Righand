"""Fleet Lite provisioning (used by setup_fleet CLI and paid Fleet upgrades)."""

import uuid

from api.models import FleetMembership, Tenant, User


def ensure_fleet_for_owner(owner: User, fleet_name: str = None, max_drivers: int = 5) -> Tenant:
    existing = FleetMembership.objects.filter(user_id=owner.id).first()
    if existing:
        return Tenant.objects.filter(pk=existing.tenant_id).first()

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
    tenant.save()
    membership.save()
    return tenant
