import os
import uuid
from unittest import mock

from django.test import TestCase, override_settings

from api.jwt_auth import create_access_token
from api.models import Subscription, User
from api.schema_migrations import ensure_core_schema
from subscription_service import get_or_create_subscription


def _make_user(email, license_number):
    user = User(id=str(uuid.uuid4()), email=email, password_hash='x', name=email.split('@')[0], trucker_license=license_number)
    user.save()
    return user


def _headers(user):
    return {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(user.id)}'}


@override_settings(ALLOW_UNPAID_TIER_CHANGES=False)
class UnpaidTierChangeTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com', 'DRV1')

    def _post(self, path, payload):
        return self.client.post(path, payload, content_type='application/json', **_headers(self.user))

    def test_activate_refused_without_payment(self):
        response = self._post('/api/subscriptions/activate', {'tier': 'fleet'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')

    def test_renew_refused_without_payment(self):
        response = self._post('/api/subscriptions/renew', {})
        self.assertEqual(response.status_code, 403)

    def test_fake_google_order_id_does_not_unlock(self):
        response = self._post('/api/subscriptions/verify-purchase', {
            'productId': 'righand_pro_monthly', 'googleOrderId': 'GPA.FAKE-1',
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')

    def test_google_verification_not_configured_returns_503(self):
        with mock.patch.dict(os.environ, {'GOOGLE_PLAY_PACKAGE_NAME': '', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON': ''}):
            response = self._post('/api/subscriptions/verify-purchase', {
                'productId': 'righand_pro_monthly', 'purchaseToken': 'tok',
            })
        self.assertEqual(response.status_code, 503)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')


GOOGLE_ENV = {'GOOGLE_PLAY_PACKAGE_NAME': 'com.righand.app', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON': '{}'}


@mock.patch.dict(os.environ, GOOGLE_ENV)
class GooglePlayVerificationTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com', 'DRV1')

    def _verify(self, google_response, product='righand_pro_monthly'):
        with mock.patch('google_play_service._fetch_subscription', return_value=google_response):
            return self.client.post('/api/subscriptions/verify-purchase', {
                'productId': product, 'purchaseToken': 'tok',
            }, content_type='application/json', **_headers(self.user))

    def test_active_subscription_unlocks(self):
        response = self._verify({
            'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE',
            'lineItems': [{'productId': 'righand_pro_monthly'}],
            'latestOrderId': 'GPA.1234',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'pro')

    def test_expired_subscription_rejected(self):
        response = self._verify({
            'subscriptionState': 'SUBSCRIPTION_STATE_EXPIRED',
            'lineItems': [{'productId': 'righand_pro_monthly'}],
            'latestOrderId': 'GPA.1234',
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')

    def test_pro_token_cannot_unlock_fleet(self):
        response = self._verify({
            'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE',
            'lineItems': [{'productId': 'righand_pro_monthly'}],
            'latestOrderId': 'GPA.1234',
        }, product='righand_fleet_monthly')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(get_or_create_subscription(self.user.id).tier, 'free')


FLW_ENV = {'FLUTTERWAVE_SECRET_KEY': 'sk', 'FLUTTERWAVE_SECRET_HASH': 'hash', 'FLUTTERWAVE_CURRENCY': 'UGX',
           'FLUTTERWAVE_PRICE_PRO': '130000', 'FLUTTERWAVE_PRICE_FLEET': '330000'}


@mock.patch.dict(os.environ, FLW_ENV)
class FlutterwaveVerificationTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com', 'DRV1')
        self.other = _make_user('other@example.com', 'DRV2')
        self.sub = get_or_create_subscription(self.user.id)
        get_or_create_subscription(self.other.id)

    def _transaction(self, **overrides):
        data = {
            'id': 9001,
            'status': 'successful',
            'tx_ref': f'{self.sub.subscriber_id}:fleet:1700000000:abc123',
            'currency': 'UGX',
            'amount': 330000,
        }
        data.update(overrides)
        return {'status': 'success', 'data': data}

    def _verify(self, transaction, user=None):
        with mock.patch('api.views.subscriptions._fetch_flutterwave_transaction', return_value=transaction):
            return self.client.post('/api/subscriptions/flutterwave-verify', {'transactionId': '9001'},
                                    content_type='application/json', **_headers(user or self.user))

    def test_full_payment_unlocks_tier(self):
        response = self._verify(self._transaction())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Subscription.objects.get(user_id=self.user.id).tier, 'fleet')

    def test_underpayment_rejected(self):
        response = self._verify(self._transaction(amount=100))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Subscription.objects.get(user_id=self.user.id).tier, 'free')

    def test_wrong_currency_rejected(self):
        response = self._verify(self._transaction(currency='KES'))
        self.assertEqual(response.status_code, 400)

    def test_cannot_claim_someone_elses_payment(self):
        response = self._verify(self._transaction(), user=self.other)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Subscription.objects.get(user_id=self.other.id).tier, 'free')
        self.assertEqual(Subscription.objects.get(user_id=self.user.id).tier, 'free')

    def test_foreign_tx_ref_rejected(self):
        response = self._verify(self._transaction(tx_ref='something-else'))
        self.assertEqual(response.status_code, 400)

    def test_webhook_requires_secret_hash(self):
        response = self.client.post('/api/subscriptions/flutterwave-webhook',
                                    {'event': 'charge.completed', 'data': {'id': 9001}},
                                    content_type='application/json', HTTP_VERIF_HASH='wrong')
        self.assertEqual(response.status_code, 401)

    def test_webhook_unlocks_after_reverifying(self):
        with mock.patch('api.views.subscriptions._fetch_flutterwave_transaction',
                        return_value=self._transaction()) as fetch:
            response = self.client.post('/api/subscriptions/flutterwave-webhook',
                                        {'event': 'charge.completed', 'data': {'id': 9001, 'amount': 1}},
                                        content_type='application/json', HTTP_VERIF_HASH='hash')
        self.assertEqual(response.status_code, 200)
        fetch.assert_called_once_with('sk', 9001)
        self.assertEqual(Subscription.objects.get(user_id=self.user.id).tier, 'fleet')


class PaymentOptionsTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com', 'DRV1')

    def _me(self):
        return self.client.get('/api/subscriptions/me', **_headers(self.user)).json()

    def test_flutterwave_hidden_when_not_configured(self):
        with mock.patch.dict(os.environ, {'FLUTTERWAVE_SECRET_KEY': ''}):
            self.assertFalse(self._me()['flutterwaveConfigured'])

    def test_flutterwave_shown_when_configured(self):
        with mock.patch.dict(os.environ, {'FLUTTERWAVE_SECRET_KEY': 'sk'}):
            self.assertTrue(self._me()['flutterwaveConfigured'])


class FrontendRedirectTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        self.user = _make_user('driver@example.com', 'DRV1')

    @mock.patch.dict(os.environ, {'FLUTTERWAVE_SECRET_KEY': 'sk', 'RIGHAND_FRONTEND_URL': 'https://righand.gilliomfrontlinedigital.com'})
    def test_untrusted_frontend_url_is_replaced(self):
        captured = {}

        def fake_post(url, json, headers, timeout):
            captured.update(json)
            return mock.Mock(json=lambda: {'status': 'success', 'data': {'link': 'https://checkout.flutterwave.com/x'}})

        with mock.patch('api.views.subscriptions._requests.post', side_effect=fake_post):
            response = self.client.post('/api/subscriptions/flutterwave-checkout',
                                        {'tier': 'pro', 'frontendUrl': 'https://evil.example'},
                                        content_type='application/json', **_headers(self.user))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(captured['redirect_url'].startswith('https://righand.gilliomfrontlinedigital.com?'))
