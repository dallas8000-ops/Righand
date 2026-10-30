"""Server-side verification of Google Play subscription purchases.

Needs two Railway variables:
  GOOGLE_PLAY_PACKAGE_NAME            e.g. com.righand.app
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON    the service account key JSON (with
                                      Play Console "View financial data" access)
"""

import json
import os

GOOGLE_PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
ACTIVE_STATES = ('SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD')


class GooglePlayNotConfigured(Exception):
    pass


class GooglePlayVerificationError(Exception):
    pass


def is_configured() -> bool:
    return bool(
        os.environ.get('GOOGLE_PLAY_PACKAGE_NAME', '').strip()
        and os.environ.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', '').strip()
    )


def _fetch_subscription(package_name: str, purchase_token: str) -> dict:
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account

    info = json.loads(os.environ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'])
    credentials = service_account.Credentials.from_service_account_info(info, scopes=[GOOGLE_PLAY_SCOPE])
    url = (
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
        f'{package_name}/purchases/subscriptionsv2/tokens/{purchase_token}'
    )
    resp = AuthorizedSession(credentials).get(url, timeout=10)
    if resp.status_code != 200:
        raise GooglePlayVerificationError(f'Google Play rejected the purchase token (HTTP {resp.status_code})')
    return resp.json()


def verify_subscription(purchase_token: str, expected_product_id: str) -> str:
    """Confirm the token is an active subscription to expected_product_id.

    Returns Google's order ID, which is used to stop one purchase unlocking
    more than one account.
    """
    if not is_configured():
        raise GooglePlayNotConfigured('Google Play purchase verification is not configured on this server')
    if not purchase_token:
        raise GooglePlayVerificationError('purchaseToken required')

    package_name = os.environ['GOOGLE_PLAY_PACKAGE_NAME'].strip()
    data = _fetch_subscription(package_name, purchase_token)

    if data.get('subscriptionState') not in ACTIVE_STATES:
        raise GooglePlayVerificationError('Subscription is not active')
    product_ids = {item.get('productId') for item in data.get('lineItems') or []}
    if expected_product_id not in product_ids:
        raise GooglePlayVerificationError('Purchase is for a different product')
    order_id = data.get('latestOrderId')
    if not order_id:
        raise GooglePlayVerificationError('Google Play did not return an order ID')
    return order_id
