"""Stripe subscription lifecycle: access must end when payment ends."""

import os
import uuid
from types import SimpleNamespace
from unittest import mock

from django.test import TestCase

from api.jwt_auth import create_access_token
from api.models import PurchaseEvent, User
from api.schema_migrations import ensure_core_schema
from subscription_service import TIER_PRICES, emit_for_event, get_or_create_subscription

STRIPE_ENV = {'STRIPE_SECRET_KEY': 'sk_test_x', 'STRIPE_WEBHOOK_SECRET': 'whsec_x'}


def _make_user(email):
    user = User(id=str(uuid.uuid4()), email=email, password_hash='x', name='d', trucker_license=email)
    user.save()
    return user


def _paid(user, tier='pro'):
    sub = get_or_create_subscription(user.id)
    sub.tier = tier
    sub.save()
    return sub


@mock.patch.dict(os.environ, STRIPE_ENV)
@mock.patch('subscription_service.emit_righand_event')
class StripeWebhookDowngradeTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com')

    def _send(self, event_type, status='canceled', sub_id='sub_old', live=()):
        event = {'type': event_type, 'data': {'object': {
            'id': sub_id, 'status': status, 'metadata': {'user_id': self.user.id},
        }}}
        with mock.patch('stripe.Webhook.construct_event', return_value=event), \
                mock.patch('subscription_service._live_stripe_subscriptions', return_value=list(live)):
            return self.client.post('/api/v1/billing/webhook/', b'{}', content_type='application/json',
                                    HTTP_STRIPE_SIGNATURE='t=1,v1=x')

    def test_subscription_deleted_downgrades_to_free(self, _emit):
        _paid(self.user)
        response = self._send('customer.subscription.deleted')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')
        self.assertTrue(PurchaseEvent.objects.filter(event_type='cancel', google_order_id='sub_old').exists())

    def test_unpaid_after_failed_retries_downgrades(self, _emit):
        _paid(self.user, 'fleet')
        self._send('customer.subscription.updated', status='unpaid')
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')

    def test_past_due_keeps_access_while_stripe_retries(self, _emit):
        _paid(self.user)
        self._send('customer.subscription.updated', status='past_due')
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'pro')

    def test_old_subscription_ending_does_not_lock_out_resubscribed_user(self, _emit):
        _paid(self.user)
        self._send('customer.subscription.deleted', live=[{'id': 'sub_new', 'status': 'active'}])
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'pro')


@mock.patch.dict(os.environ, STRIPE_ENV)
@mock.patch('subscription_service.emit_righand_event')
class InAppCancelTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com')
        _paid(self.user)

    def _cancel(self):
        return self.client.post('/api/subscriptions/cancel', {}, content_type='application/json',
                                HTTP_AUTHORIZATION=f'Bearer {create_access_token(self.user.id)}')

    def test_cancel_stops_stripe_billing(self, _emit):
        found = SimpleNamespace(data=[{'id': 'sub_live', 'status': 'active'}])
        with mock.patch('stripe.Subscription.search', return_value=found), \
                mock.patch('stripe.Subscription.cancel') as stripe_cancel:
            response = self._cancel()
        self.assertEqual(response.status_code, 200)
        stripe_cancel.assert_called_once_with('sub_live')
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')

    def test_stripe_failure_keeps_tier_so_user_can_retry(self, _emit):
        with mock.patch('stripe.Subscription.search', side_effect=RuntimeError('stripe down')):
            response = self._cancel()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'pro')


class CancelEventTierTests(TestCase):
    def setUp(self):
        ensure_core_schema()

    def test_fleet_cancel_reported_as_fleet(self):
        user = _make_user('fleet@example.com')
        sub = get_or_create_subscription(user.id)
        with mock.patch('subscription_service.emit_righand_event') as emit:
            emit_for_event('cancel', user, sub, TIER_PRICES['fleet'])
        self.assertEqual(emit.call_args[0][0], 'cancel_fleet')
