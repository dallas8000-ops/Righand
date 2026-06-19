"""
Create a RigHand login account (production or local DB).

Usage:
  $env:DATABASE_URL = "postgresql://..."
  python create_user.py --email user@example.com --name "Driver Name" --license CDL123456
"""

import argparse
import getpass
import os
import sys
import uuid

from werkzeug.security import generate_password_hash


def setup_django():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'righand.settings')
    import django
    django.setup()


def create_user(email: str, password: str, name: str, trucker_license: str):
    from api.models import User

    email = email.strip().lower()
    trucker_license = trucker_license.strip()

    if User.objects.filter(email=email).exists():
        print(f'User already exists: {email}')
        print('Use reset_password.py to change the password instead.')
        sys.exit(1)

    if User.objects.filter(trucker_license=trucker_license).exists():
        print(f'Trucker license already registered: {trucker_license}')
        sys.exit(1)

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=generate_password_hash(password),
        name=name.strip(),
        trucker_license=trucker_license,
    )
    user.save()
    print(f'Created user: {user.email} ({user.name})')
    print(f'  ID: {user.id}')
    print(f'  License: {user.trucker_license}')


def main():
    setup_django()
    parser = argparse.ArgumentParser(description='Create a RigHand user account')
    parser.add_argument('--email', required=True, help='Login email')
    parser.add_argument('--name', required=True, help='Display name')
    parser.add_argument('--license', required=True, help='Trucker license number (unique)')
    parser.add_argument('--password', help='Password (omit to prompt securely)')
    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass.getpass('Password: ')
        confirm = getpass.getpass('Confirm password: ')
        if password != confirm:
            print('Passwords do not match.')
            sys.exit(1)
    if len(password) < 6:
        print('Password must be at least 6 characters.')
        sys.exit(1)

    create_user(args.email, password, args.name, args.license)


if __name__ == '__main__':
    main()
