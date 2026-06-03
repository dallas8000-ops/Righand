"""
Set or reset a user's login password (production or local DB).

Usage:
  $env:DJANGO_ENV = "production"
  $env:DATABASE_URL = "postgresql://..."
  python reset_password.py --email user@example.com
"""

import argparse
import getpass
import os
import sys

from werkzeug.security import generate_password_hash


def setup_django():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'righand.settings')
    import django
    django.setup()


def reset_password(email: str, password: str):
    from api.models import User

    user = User.objects.filter(email=email.strip().lower()).first()
    if not user:
        user = User.objects.filter(email=email.strip()).first()
    if not user:
        print(f'User not found: {email}')
        sys.exit(1)

    user.password_hash = generate_password_hash(password)
    user.save()
    print(f'Password updated for {user.email}')


def main():
    setup_django()
    parser = argparse.ArgumentParser(description='Reset RigHand user password')
    parser.add_argument('--email', required=True, help='User email address')
    parser.add_argument('--password', help='New password (omit to prompt securely)')
    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass.getpass('New password: ')
        confirm = getpass.getpass('Confirm password: ')
        if password != confirm:
            print('Passwords do not match.')
            sys.exit(1)
    if len(password) < 6:
        print('Password must be at least 6 characters.')
        sys.exit(1)

    reset_password(args.email, password)


if __name__ == '__main__':
    main()
