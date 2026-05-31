"""
Set or reset a user's login password (production or local DB).

Usage:
  $env:FLASK_ENV = "production"
  $env:DATABASE_URL = "postgresql://..."
  python reset_password.py --email dallas8000@gmail.com
"""

import argparse
import getpass
import sys

from werkzeug.security import generate_password_hash

from setup_fleet import create_cli_app
from models import db, User


def reset_password(email: str, password: str):
    user = User.query.filter_by(email=email.strip().lower()).first()
    if not user:
        # try exact match too
        user = User.query.filter_by(email=email.strip()).first()
    if not user:
        print(f'User not found: {email}')
        sys.exit(1)

    user.password_hash = generate_password_hash(password)
    db.session.commit()
    print(f'Password updated for {user.email}')


def main():
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

    app = create_cli_app()
    with app.app_context():
        reset_password(args.email, password)


if __name__ == '__main__':
    main()
