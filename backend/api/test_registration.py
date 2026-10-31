import uuid

from django.test import TestCase

from api.jwt_auth import create_access_token
from api.models import User
from api.schema_migrations import ensure_core_schema
from fleet_service import ensure_fleet_for_owner


class RegistrationLicenceTests(TestCase):
    """The driving licence number is optional and is never used to look up accounts."""

    def setUp(self):
        ensure_core_schema()

    def _register(self, payload):
        return self.client.post('/api/auth/register', payload, content_type='application/json')

    def test_register_without_licence(self):
        response = self._register({'email': 'a@example.com', 'password': 'secret123', 'name': 'Driver A'})
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email='a@example.com')
        self.assertIsNone(user.trucker_license)

    def test_blank_licence_is_stored_as_empty(self):
        response = self._register({'email': 'b@example.com', 'password': 'secret123', 'name': 'B', 'truckerLicense': '   '})
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(User.objects.get(email='b@example.com').trucker_license)

    def test_same_licence_does_not_block_or_reveal_an_account(self):
        first = self._register({'email': 'c@example.com', 'password': 'secret123', 'name': 'C', 'truckerLicense': 'UG-123'})
        second = self._register({'email': 'd@example.com', 'password': 'secret123', 'name': 'D', 'truckerLicense': 'UG-123'})
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertNotIn('licence', second.content.decode().lower().replace('trucker', ''))

    def test_duplicate_email_still_rejected(self):
        self._register({'email': 'e@example.com', 'password': 'secret123', 'name': 'E'})
        response = self._register({'email': 'e@example.com', 'password': 'secret123', 'name': 'E2'})
        self.assertEqual(response.status_code, 409)

    def test_missing_name_still_rejected(self):
        response = self._register({'email': 'f@example.com', 'password': 'secret123'})
        self.assertEqual(response.status_code, 400)


class FleetDriverWithoutLicenceTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.owner = User(id=str(uuid.uuid4()), email='owner@example.com', password_hash='x', name='Owner')
        self.owner.save()
        ensure_fleet_for_owner(self.owner)
        self.headers = {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(self.owner.id)}'}

    def test_owner_creates_driver_without_licence(self):
        response = self.client.post(
            '/api/fleet/drivers',
            {'email': 'new@example.com', 'name': 'New Driver', 'password': 'temp123'},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(User.objects.get(email='new@example.com').trucker_license)
