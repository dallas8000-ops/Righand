"""After the 30-day trial, the only way to keep using RigHand is to subscribe."""

import uuid
from datetime import timedelta
from unittest import mock

from django.test import TestCase

from api.jwt_auth import create_access_token
from api.models import Subscription, User
from api.schema_migrations import ensure_core_schema
from fleet_service import add_fleet_member, ensure_fleet_for_owner
from subscription_service import get_or_create_subscription, utcnow

DATA_ENDPOINTS = ('/api/fleet/status', '/api/compliance/summary', '/api/reports/metrics', '/api/categories')


def _make_user(email):
    user = User(id=str(uuid.uuid4()), email=email, password_hash='x', name=email.split('@')[0])
    user.save()
    return user


class TrialPaywallTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com')

    def _get(self, path, user=None):
        user = user or self.user
        return self.client.get(path, HTTP_AUTHORIZATION=f'Bearer {create_access_token(user.id)}')

    def _expire_trial(self, user=None):
        sub = get_or_create_subscription((user or self.user).id)
        sub.started_at = utcnow() - timedelta(days=31)
        sub.tier = 'free'
        sub.save()
        return sub

    def _set_tier(self, tier, user=None):
        sub = self._expire_trial(user)
        sub.tier = tier
        sub.save()

    # --- trial window -------------------------------------------------------------------------
    def test_new_account_in_trial_can_use_the_app(self):
        for path in DATA_ENDPOINTS:
            self.assertNotEqual(self._get(path).status_code, 402, path)

    # --- trial over, unpaid -------------------------------------------------------------------
    def test_expired_unpaid_account_is_locked_out_of_every_data_endpoint(self):
        self._expire_trial()
        for path in DATA_ENDPOINTS:
            response = self._get(path)
            self.assertEqual(response.status_code, 402, path)
            self.assertEqual(response.json()['code'], 'SUBSCRIPTION_REQUIRED', path)

    def test_expired_account_can_still_see_its_status_and_pay(self):
        self._expire_trial()
        me = self._get('/api/subscriptions/me')
        self.assertEqual(me.status_code, 200)
        self.assertFalse(me.json()['hasAccess'])
        self.assertTrue(me.json()['trialExpired'])
        self.assertNotEqual(self._get('/api/subscriptions/events').status_code, 402)

    def test_expired_account_can_still_sign_in(self):
        self._expire_trial()
        self.assertNotEqual(self._get('/api/auth/verify').status_code, 402)

    # --- paid ---------------------------------------------------------------------------------
    def test_paid_accounts_keep_access_after_the_trial(self):
        for tier in ('pro', 'fleet'):
            self._set_tier(tier)
            for path in DATA_ENDPOINTS:
                self.assertNotEqual(self._get(path).status_code, 402, (tier, path))
            self.assertTrue(self._get('/api/subscriptions/me').json()['hasAccess'])

    # --- fleet seats --------------------------------------------------------------------------
    def test_driver_seat_rides_on_the_fleet_owners_paid_plan(self):
        owner = _make_user('owner@example.com')
        self._set_tier('fleet', owner)
        tenant = ensure_fleet_for_owner(owner)
        add_fleet_member(tenant, self.user, 'driver')
        self._expire_trial()

        self.assertNotEqual(self._get('/api/fleet/status').status_code, 402)

        # Owner stops paying -> the driver is locked out too.
        self._set_tier('free', owner)
        self.assertEqual(self._get('/api/fleet/status').status_code, 402)

    # --- complimentary (owner's own login) ----------------------------------------------------
    def test_complimentary_email_keeps_access(self):
        self._expire_trial()
        with mock.patch.dict('os.environ', {'RIGHAND_COMPLIMENTARY_EMAILS': 'Someone@x.com, DRIVER@example.com'}):
            self.assertNotEqual(self._get('/api/fleet/status').status_code, 402)
        self.assertEqual(self._get('/api/fleet/status').status_code, 402)
