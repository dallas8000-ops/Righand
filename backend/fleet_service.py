"""Fleet Lite provisioning (used by setup_fleet CLI and paid Fleet upgrades)."""

import os
import uuid

from api.models import FleetMembership, Tenant, User

FLEET_LITE_INCLUDED_USERS = int(os.environ.get('FLEET_LITE_INCLUDED_USERS', '5'))
FLEET_SEAT_ROLES = ('driver', 'dispatcher')


def validate_fleet_limit(max_drivers: int) -> int:
    try:
        limit = int(max_drivers)
    except (TypeError, ValueError):
        raise ValueError('Fleet user limit must be a number')

    if limit < 1:
        raise ValueError('Fleet Lite must include at least 1 fleet seat')
    if limit > FLEET_LITE_INCLUDED_USERS:
        raise ValueError(f'Fleet Lite includes 1 billing owner plus up to {FLEET_LITE_INCLUDED_USERS} fleet seats. Upgrade pricing is required for more users.')
    return limit


def fleet_seat_count(tenant: Tenant) -> int:
    return FleetMembership.objects.filter(tenant_id=tenant.id, role__in=FLEET_SEAT_ROLES).count()


def add_fleet_member(tenant: Tenant, member: User, role: str) -> FleetMembership:
    if role not in (*FLEET_SEAT_ROLES, 'owner'):
        raise ValueError('Fleet role must be owner, dispatcher, or driver')

    existing = FleetMembership.objects.filter(user_id=member.id).first()
    if existing:
        raise ValueError(f'{member.email} is already in a fleet (role: {existing.role}).')

    if role in FLEET_SEAT_ROLES and fleet_seat_count(tenant) >= tenant.max_drivers:
        raise ValueError(f'Fleet Lite is at its {tenant.max_drivers}-seat limit. Upgrade pricing is required for more users.')

    membership = FleetMembership(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        user_id=member.id,
        role=role,
    )
    membership.save()
    return membership


def ensure_fleet_for_owner(owner: User, fleet_name: str = None, max_drivers: int = 5) -> Tenant:
    max_drivers = validate_fleet_limit(max_drivers)
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
