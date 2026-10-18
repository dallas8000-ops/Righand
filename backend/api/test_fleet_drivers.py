import uuid

from django.test import TestCase

from api.jwt_auth import create_access_token
from api.models import FleetMembership, User
from api.schema_migrations import ensure_core_schema
from fleet_service import ensure_fleet_for_owner


def _make_user(email, license_number):
    user = User(id=str(uuid.uuid4()), email=email, password_hash='x', name=email.split('@')[0], trucker_license=license_number)
    user.save()
    return user


class FleetDriverTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.owner = _make_user('owner@example.com', 'OWN1')
        ensure_fleet_for_owner(self.owner)
        self.owner_headers = {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(self.owner.id)}'}

    def _post(self, payload, headers=None):
        return self.client.post('/api/fleet/drivers', payload, content_type='application/json', **(headers or self.owner_headers))

    def test_owner_links_existing_account(self):
        driver = _make_user('driver@example.com', 'DRV1')
        response = self._post({'email': 'Driver@Example.com'})
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()['created'])
        self.assertTrue(FleetMembership.objects.filter(user_id=driver.id, role='driver').exists())

    def test_unknown_email_requires_account_details(self):
        response = self._post({'email': 'new@example.com'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['code'], 'ACCOUNT_DETAILS_REQUIRED')

    def test_creates_account_with_details(self):
        response = self._post({'email': 'new@example.com', 'name': 'New Driver', 'truckerLicense': 'NEW1', 'password': 'temp123'})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()['created'])
        self.assertTrue(User.objects.filter(email='new@example.com').exists())

    def test_non_owner_cannot_add(self):
        driver = _make_user('driver@example.com', 'DRV1')
        headers = {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(driver.id)}'}
        self.assertEqual(self._post({'email': 'x@example.com'}, headers).status_code, 403)

    def test_seat_limit_enforced_and_remove_frees_seat(self):
        members = [_make_user(f'd{i}@example.com', f'L{i}') for i in range(6)]
        for member in members[:5]:
            self.assertEqual(self._post({'email': member.email}).status_code, 201)
        self.assertEqual(self._post({'email': members[5].email}).status_code, 409)
        removed = self.client.delete(f'/api/fleet/drivers/{members[0].id}', **self.owner_headers)
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(self._post({'email': members[5].email}).status_code, 201)

    def test_owner_cannot_be_removed(self):
        response = self.client.delete(f'/api/fleet/drivers/{self.owner.id}', **self.owner_headers)
        self.assertEqual(response.status_code, 400)
