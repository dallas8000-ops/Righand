"""Quick API smoke test against the Django backend."""

import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'righand.settings')

import django

django.setup()

from django.test import Client


def main():
    client = Client()
    health = client.get('/health')
    print('health', health.status_code, health.json())
    root = client.get('/')
    print('home', root.status_code, root.json())


if __name__ == '__main__':
    main()
