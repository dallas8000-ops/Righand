"""
Enable Fleet Lite for a carrier / owner account.

Usage:
  python setup_fleet.py list-users
  python setup_fleet.py create --owner-email owner@example.com --fleet-name "ABC Trucking"
"""

import argparse
import os
import sys
import uuid


def setup_django():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'righand.settings')
    import django
    django.setup()


def list_users():
    from api.models import User

    users = User.objects.order_by('email')
    if not users:
        print('No users found. Register accounts in the app first.')
        return
    print(f'{"EMAIL":<40} {"NAME":<25} {"ID"}')
    print('-' * 90)
    for u in users:
        print(f'{u.email:<40} {u.name:<25} {u.id}')


def get_user_by_email(email: str):
    from api.models import User

    user = User.objects.filter(email=email.strip().lower()).first()
    if not user:
        user = User.objects.filter(email=email.strip()).first()
    if not user:
        print(f'User not found: {email}')
        sys.exit(1)
    return user


def get_tenant_for_owner(owner):
    from api.models import FleetMembership, Tenant

    membership = FleetMembership.objects.filter(user_id=owner.id, role='owner').first()
    if membership:
        return Tenant.objects.filter(pk=membership.tenant_id).first()
    return None


def create_fleet(owner_email: str, fleet_name: str, max_drivers: int = 5):
    from api.models import FleetMembership, Tenant
    from fleet_service import ensure_fleet_for_owner

    owner = get_user_by_email(owner_email)
    existing = FleetMembership.objects.filter(user_id=owner.id).first()
    if existing:
        tenant = Tenant.objects.filter(pk=existing.tenant_id).first()
        print(f'User already in fleet "{tenant.name}" as {existing.role}.')
        return

    tenant = ensure_fleet_for_owner(owner, fleet_name, max_drivers)
    print(f'Fleet Lite enabled: "{fleet_name}"')
    print(f'  Owner: {owner.email} (role: owner)')
    print(f'  Tenant ID: {tenant.id}')
    print(f'  Max drivers: {max_drivers}')
    print('Log out and back in, then open the Fleet tab.')


def add_member(owner_email: str, member_email: str, role: str):
    from api.models import FleetMembership

    owner = get_user_by_email(owner_email)
    member = get_user_by_email(member_email)
    tenant = get_tenant_for_owner(owner)
    if not tenant:
        print(f'No fleet found for owner {owner_email}. Run create first.')
        sys.exit(1)

    existing = FleetMembership.objects.filter(user_id=member.id).first()
    if existing:
        print(f'{member_email} is already in a fleet (role: {existing.role}).')
        sys.exit(1)

    driver_count = FleetMembership.objects.filter(tenant_id=tenant.id, role='driver').count()
    if role == 'driver' and driver_count >= tenant.max_drivers:
        print(f'Fleet is at max drivers ({tenant.max_drivers}).')
        sys.exit(1)

    FleetMembership(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        user_id=member.id,
        role=role,
    ).save()
    print(f'Added {member.email} as {role} to "{tenant.name}".')


def show_status(owner_email: str):
    from api.models import FleetMembership, User

    owner = get_user_by_email(owner_email)
    tenant = get_tenant_for_owner(owner)
    if not tenant:
        print(f'No fleet for {owner_email}.')
        return
    members = FleetMembership.objects.filter(tenant_id=tenant.id)
    print(f'Fleet: {tenant.name} ({members.count()}/{tenant.max_drivers} slots)')
    for m in members:
        u = User.objects.filter(pk=m.user_id).first()
        print(f'  - {m.role:<12} {u.email if u else m.user_id}')


def main():
    setup_django()
    parser = argparse.ArgumentParser(description='Fleet Lite setup')
    sub = parser.add_subparsers(dest='command', required=True)

    sub.add_parser('list-users', help='List registered users')

    create_p = sub.add_parser('create', help='Create fleet for an owner')
    create_p.add_argument('--owner-email', required=True)
    create_p.add_argument('--fleet-name', required=True)
    create_p.add_argument('--max-drivers', type=int, default=5)

    driver_p = sub.add_parser('add-driver', help='Link a driver to the fleet')
    driver_p.add_argument('--owner-email', required=True)
    driver_p.add_argument('--driver-email', required=True)

    disp_p = sub.add_parser('add-dispatcher', help='Link a dispatcher to the fleet')
    disp_p.add_argument('--owner-email', required=True)
    disp_p.add_argument('--dispatcher-email', required=True)

    status_p = sub.add_parser('status', help='Show fleet members')
    status_p.add_argument('--owner-email', required=True)

    args = parser.parse_args()
    if args.command == 'list-users':
        list_users()
    elif args.command == 'create':
        create_fleet(args.owner_email, args.fleet_name, args.max_drivers)
    elif args.command == 'add-driver':
        add_member(args.owner_email, args.driver_email, 'driver')
    elif args.command == 'add-dispatcher':
        add_member(args.owner_email, args.dispatcher_email, 'dispatcher')
    elif args.command == 'status':
        show_status(args.owner_email)


if __name__ == '__main__':
    main()
