import os
import uuid

import hmac
import urllib.parse

import requests as _requests

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

import google_play_service
from api.jwt_auth import jwt_required
from api.models import Subscription, User
from api.utils import parse_json
from subscription_service import (
    TIER_PRICES,
    apply_stripe_checkout_completed,
    apply_purchase_by_product,
    apply_tier_upgrade,
    catalog_product_ids,
    catalog_stripe_price_ids,
    check_milestones,
    flutterwave_currency,
    flutterwave_price,
    get_or_create_subscription,
    log_purchase_event,
    resolve_product,
    utcnow,
)

FLUTTERWAVE_API = 'https://api.flutterwave.com/v3'


def _trusted_frontend_origins():
    origins = set(settings.CSRF_TRUSTED_ORIGINS)
    origins.update(getattr(settings, 'CORS_ALLOWED_ORIGINS', []))
    configured = os.environ.get('RIGHAND_FRONTEND_URL', '').strip().rstrip('/')
    if configured:
        origins.add(configured)
    return {origin.rstrip('/') for origin in origins if origin}


def _safe_frontend_url(request, body):
    """Where to send the user after paying. Only our own origins are accepted,
    so a crafted frontendUrl cannot route a paying user to another site."""
    trusted = _trusted_frontend_origins()
    for candidate in (body.get('frontendUrl'), request.headers.get('Origin')):
        candidate = (candidate or '').strip().rstrip('/')
        if not candidate:
            continue
        parsed = urllib.parse.urlparse(candidate)
        origin = f'{parsed.scheme}://{parsed.netloc}'
        if origin in trusted or (settings.DEBUG and parsed.hostname in ('localhost', '127.0.0.1')):
            return origin
    configured = os.environ.get('RIGHAND_FRONTEND_URL', '').strip().rstrip('/')
    return configured or request.build_absolute_uri('/').rstrip('/')


@jwt_required
@require_http_methods(['GET'])
def my_subscription(request):
    user_id = request.righand_user_id
    check_milestones()
    sub = get_or_create_subscription(user_id)
    payload = sub.to_dict()
    products = catalog_product_ids()
    payload['products'] = {
        'pro': {'productId': products['pro'], 'price': TIER_PRICES['pro']},
        'fleet': {'productId': products['fleet'], 'price': TIER_PRICES['fleet']},
    }
    payload['stripeConfigured'] = bool(os.environ.get('STRIPE_SECRET_KEY') and os.environ.get('STRIPE_PRICE_ID_PRO'))
    return JsonResponse(payload)


@jwt_required
@require_http_methods(['GET'])
def my_purchase_events(request):
    user_id = request.righand_user_id
    sub = get_or_create_subscription(user_id)
    from api.models import PurchaseEvent

    events = PurchaseEvent.objects.filter(subscription_id=sub.id).order_by('-occurred_at')[:100]
    return JsonResponse({
        'subscriberId': sub.subscriber_id,
        'events': [e.to_dict() for e in events],
    })


@jwt_required
@require_http_methods(['POST'])
def verify_purchase(request):
    user_id = request.righand_user_id
    user = User.objects.filter(pk=user_id).first()
    if not user:
        return JsonResponse({'error': 'User not found'}, status=404)

    body = parse_json(request)
    product_id = body.get('productId') or body.get('product_id') or body.get('tier')
    purchase_token = body.get('purchaseToken') or body.get('purchase_token')

    if not product_id:
        return JsonResponse({'error': 'productId required'}, status=400)
    resolved = resolve_product(product_id)
    if not resolved:
        return JsonResponse({'error': f'Unknown product: {product_id}'}, status=400)
    if not purchase_token:
        return JsonResponse({'error': 'purchaseToken required (Google Play purchase token)'}, status=400)

    # The client's word is not proof of payment: ask Google before unlocking.
    tier, _amount = resolved
    store_product_id = catalog_product_ids()[tier]
    try:
        google_order_id = google_play_service.verify_subscription(purchase_token, store_product_id)
    except google_play_service.GooglePlayNotConfigured as exc:
        return JsonResponse({'error': str(exc)}, status=503)
    except google_play_service.GooglePlayVerificationError as exc:
        return JsonResponse({'error': str(exc)}, status=400)

    try:
        sub = apply_purchase_by_product(user, store_product_id, google_order_id, store_product_id)
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)

    return JsonResponse({
        'message': 'Purchase verified — features unlocked',
        'tier': sub.tier,
        **sub.to_dict(),
    })


@jwt_required
@require_http_methods(['POST'])
def activate_subscription(request):
    if not settings.ALLOW_UNPAID_TIER_CHANGES:
        return JsonResponse({'error': 'Upgrades require a verified payment'}, status=403)
    user_id = request.righand_user_id
    user = User.objects.filter(pk=user_id).first()
    if not user:
        return JsonResponse({'error': 'User not found'}, status=404)

    body = parse_json(request)
    tier = body.get('tier', 'pro')
    if tier not in ('pro', 'fleet'):
        return JsonResponse({'error': 'Invalid tier — use pro or fleet'}, status=400)

    amount = float(body.get('amount', TIER_PRICES[tier]))
    google_order_id = body.get('google_order_id') or body.get('googleOrderId')
    google_product_id = body.get('google_product_id') or body.get('googleProductId')

    sub = get_or_create_subscription(user_id)
    if sub.tier == tier:
        return JsonResponse({'message': f'Already on {tier}', **sub.to_dict()})

    sub = apply_tier_upgrade(user, tier, amount, google_order_id, google_product_id)
    return JsonResponse({'message': f'Subscription activated ({tier})', **sub.to_dict()}, status=201)


@jwt_required
@require_http_methods(['POST'])
def create_stripe_checkout(request):
    user_id = request.righand_user_id
    user = User.objects.filter(pk=user_id).first()
    if not user:
        return JsonResponse({'error': 'User not found'}, status=404)

    body = parse_json(request)
    tier = body.get('tier', 'pro')
    if tier not in ('pro', 'fleet'):
        return JsonResponse({'error': 'Invalid tier - use pro or fleet'}, status=400)

    secret_key = os.environ.get('STRIPE_SECRET_KEY', '').strip()
    price_id = catalog_stripe_price_ids().get(tier, '').strip()
    if not secret_key or not price_id:
        return JsonResponse({'error': 'Stripe is not configured for this tier'}, status=503)

    try:
        import stripe
    except ImportError:
        return JsonResponse({'error': 'Stripe SDK is not installed'}, status=503)

    frontend_url = _safe_frontend_url(request, body)
    stripe.api_key = secret_key
    try:
        session = stripe.checkout.Session.create(
            mode='subscription',
            line_items=[{'price': price_id, 'quantity': 1}],
            success_url=f'{frontend_url}?billing=success&tier={tier}',
            cancel_url=f'{frontend_url}?billing=cancel',
            customer_email=user.email,
            allow_promotion_codes=True,
            billing_address_collection='auto',
            metadata={
                'user_id': user.id,
                'tier': tier,
                'price_id': price_id,
            },
            subscription_data={
                'metadata': {
                    'user_id': user.id,
                    'tier': tier,
                    'price_id': price_id,
                },
            },
        )
    except Exception as exc:
        return JsonResponse({'error': f'Stripe checkout failed: {exc}'}, status=400)

    return JsonResponse({'mode': 'stripe', 'url': session.url, 'sessionId': session.id, 'tier': tier})


@require_http_methods(['POST'])
def stripe_webhook(request):
    webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET', '').strip()
    secret_key = os.environ.get('STRIPE_SECRET_KEY', '').strip()
    if not webhook_secret or not secret_key:
        return JsonResponse({'error': 'Stripe webhook is not configured'}, status=503)

    try:
        import stripe
    except ImportError:
        return JsonResponse({'error': 'Stripe SDK is not installed'}, status=503)

    signature = request.headers.get('Stripe-Signature')
    if not signature:
        return JsonResponse({'error': 'Missing Stripe-Signature header'}, status=400)

    stripe.api_key = secret_key
    try:
        event = stripe.Webhook.construct_event(request.body, signature, webhook_secret)
    except Exception:
        return JsonResponse({'error': 'Invalid Stripe webhook signature'}, status=400)

    event_type = event.get('type')
    if event_type == 'checkout.session.completed':
        try:
            sub = apply_stripe_checkout_completed(event['data']['object'])
        except ValueError as exc:
            return JsonResponse({'error': str(exc), 'eventType': event_type}, status=400)
        return JsonResponse({'received': True, 'eventType': event_type, **sub.to_dict()})

    return JsonResponse({'received': True, 'eventType': event_type})


@jwt_required
@require_http_methods(['POST'])
def renew_subscription(request):
    if not settings.ALLOW_UNPAID_TIER_CHANGES:
        return JsonResponse({'error': 'Renewals are recorded from verified payments only'}, status=403)
    user_id = request.righand_user_id
    user = User.objects.filter(pk=user_id).first()
    sub = get_or_create_subscription(user_id)

    if sub.tier not in ('pro', 'fleet'):
        return JsonResponse({'error': 'No active paid subscription'}, status=400)

    body = parse_json(request)
    amount = float(body.get('amount', TIER_PRICES.get(sub.tier, TIER_PRICES['pro'])))
    google_order_id = body.get('google_order_id') or body.get('googleOrderId')
    google_product_id = body.get('google_product_id') or body.get('googleProductId')

    from subscription_service import emit_for_event

    log_purchase_event(sub, 'renew', sub.tier, amount, google_order_id, google_product_id)
    emit_for_event('renew', user, sub, amount)
    return JsonResponse({'message': 'Renewal recorded', **sub.to_dict()})


@jwt_required
@require_http_methods(['POST'])
def cancel_subscription(request):
    user_id = request.righand_user_id
    user = User.objects.filter(pk=user_id).first()
    sub = Subscription.objects.filter(user_id=user_id).first()

    if not sub or sub.tier not in ('pro', 'fleet'):
        return JsonResponse({'error': 'No active paid subscription'}, status=404)

    from subscription_service import emit_for_event

    prev_amount = TIER_PRICES.get(sub.tier, 0)
    log_purchase_event(sub, 'cancel', 'free', 0.0)
    sub.tier = 'free'
    sub.save()
    emit_for_event('cancel', user, sub, prev_amount)
    return JsonResponse({'message': 'Subscription cancelled', **sub.to_dict()})


@jwt_required
@require_http_methods(['POST'])
def record_free_update(request):
    user_id = request.righand_user_id
    sub = get_or_create_subscription(user_id)
    sub.free_updates_used = (sub.free_updates_used or 0) + 1
    sub.save()
    return JsonResponse(sub.to_dict())


def _flutterwave_tx_ref(sub, tier):
    return f'{sub.subscriber_id}:{tier}:{int(utcnow().timestamp())}:{uuid.uuid4().hex[:6]}'


def _parse_flutterwave_tx_ref(tx_ref, meta):
    """Return (subscriber_id, tier) from a tx_ref this server created."""
    parts = (tx_ref or '').split(':')
    if len(parts) == 4 and parts[0].startswith('RH-'):
        return parts[0], parts[1]
    # Older format RH-<subscriber_id>-<ts>-<hex>; tier came from meta.
    legacy = (tx_ref or '').split('-')
    if len(legacy) == 5 and legacy[0] == 'RH' and legacy[1] == 'RH':
        return f'RH-{legacy[2]}', (meta or {}).get('tier')
    return None, None


def _fetch_flutterwave_transaction(secret_key, transaction_id):
    resp = _requests.get(
        f'{FLUTTERWAVE_API}/transactions/{transaction_id}/verify',
        headers={'Authorization': f'Bearer {secret_key}'},
        timeout=10,
    )
    return resp.json()


def _apply_flutterwave_transaction(data, expected_user=None):
    """Unlock the tier paid for in a verified Flutterwave transaction.

    Every field that decides what gets unlocked is checked against what this
    server asked for: owner (from tx_ref), tier, currency and amount paid.
    """
    if data.get('status') != 'successful':
        raise ValueError('Payment was not successful')

    subscriber_id, tier = _parse_flutterwave_tx_ref(data.get('tx_ref'), data.get('meta'))
    if not subscriber_id or tier not in ('pro', 'fleet'):
        raise ValueError('Payment was not created by RigHand checkout')
    sub = Subscription.objects.filter(subscriber_id=subscriber_id).first()
    user = User.objects.filter(pk=sub.user_id).first() if sub else None
    if not user:
        raise ValueError('Payment does not match a RigHand account')
    if expected_user is not None and user.id != expected_user.id:
        raise ValueError('Payment belongs to a different account')

    currency = str(data.get('currency') or '').upper()
    if currency != flutterwave_currency():
        raise ValueError(f'Payment currency {currency} does not match {flutterwave_currency()}')
    try:
        amount = float(data.get('amount'))
    except (TypeError, ValueError):
        raise ValueError('Payment amount is missing')
    if amount + 0.005 < flutterwave_price(tier):
        raise ValueError('Payment amount is less than the price of this plan')

    return apply_tier_upgrade(
        user, tier, amount,
        google_order_id=str(data.get('id')),
        google_product_id=f'flutterwave_{tier}',
    )


@jwt_required
@require_http_methods(['POST'])
def create_flutterwave_checkout(request):
    user_id = request.righand_user_id
    user = User.objects.filter(pk=user_id).first()
    if not user:
        return JsonResponse({'error': 'User not found'}, status=404)

    secret_key = os.environ.get('FLUTTERWAVE_SECRET_KEY', '').strip()
    if not secret_key:
        return JsonResponse({'error': 'Flutterwave is not configured on this server'}, status=503)

    body = parse_json(request)
    tier = body.get('tier', 'pro')
    if tier not in ('pro', 'fleet'):
        return JsonResponse({'error': 'Invalid tier - use pro or fleet'}, status=400)

    sub = get_or_create_subscription(user_id)
    amount = flutterwave_price(tier)
    currency = flutterwave_currency()
    frontend_url = _safe_frontend_url(request, body)
    tx_ref = _flutterwave_tx_ref(sub, tier)

    payload = {
        'tx_ref': tx_ref,
        'amount': amount,
        'currency': currency,
        'redirect_url': f'{frontend_url}?billing=success&tier={tier}&gateway=flutterwave',
        'customer': {
            'email': user.email,
            'name': user.name or user.email.split('@')[0],
            'phonenumber': '',
        },
        'customizations': {
            'title': f'RigHand {tier.capitalize()}',
            'description': f'RigHand {tier.capitalize()} - {currency} {amount:,.2f}',
            'logo': f'{frontend_url}/logo192.png',
        },
        'meta': {
            'user_id': user.id,
            'tier': tier,
            'subscriber_id': sub.subscriber_id,
        },
    }

    try:
        resp = _requests.post(
            f'{FLUTTERWAVE_API}/payments',
            json=payload,
            headers={'Authorization': f'Bearer {secret_key}'},
            timeout=10,
        )
        result = resp.json()
    except Exception as exc:
        return JsonResponse({'error': f'Flutterwave request failed: {exc}'}, status=502)

    if result.get('status') != 'success':
        msg = result.get('message', 'Unknown Flutterwave error')
        return JsonResponse({'error': f'Flutterwave error: {msg}'}, status=400)

    checkout_url = result['data']['link']
    return JsonResponse({
        'mode': 'flutterwave',
        'url': checkout_url,
        'txRef': tx_ref,
        'tier': tier,
    })


@jwt_required
@require_http_methods(['POST'])
def verify_flutterwave_payment(request):
    """Verify a Flutterwave payment after redirect and activate subscription."""
    user_id = request.righand_user_id
    user = User.objects.filter(pk=user_id).first()
    if not user:
        return JsonResponse({'error': 'User not found'}, status=404)

    secret_key = os.environ.get('FLUTTERWAVE_SECRET_KEY', '').strip()
    if not secret_key:
        return JsonResponse({'error': 'Flutterwave is not configured'}, status=503)

    body = parse_json(request)
    transaction_id = body.get('transactionId') or body.get('transaction_id')

    if not transaction_id:
        return JsonResponse({'error': 'transactionId required'}, status=400)

    try:
        result = _fetch_flutterwave_transaction(secret_key, transaction_id)
    except Exception as exc:
        return JsonResponse({'error': f'Flutterwave verification failed: {exc}'}, status=502)

    if result.get('status') != 'success':
        msg = result.get('message', 'Payment not verified')
        return JsonResponse({'error': f'Flutterwave: {msg}', 'verified': False}, status=400)

    try:
        sub = _apply_flutterwave_transaction(result.get('data') or {}, expected_user=user)
    except ValueError as exc:
        return JsonResponse({'error': str(exc), 'verified': False}, status=400)

    return JsonResponse({
        'message': 'Payment verified — features unlocked',
        'verified': True,
        'tier': sub.tier,
        **sub.to_dict(),
    })


@require_http_methods(['POST'])
def flutterwave_webhook(request):
    """Unlock paid tiers even if the user never returns to the app after paying
    (common with mobile money). Set the same secret hash in the Flutterwave
    dashboard and in FLUTTERWAVE_SECRET_HASH."""
    secret_hash = os.environ.get('FLUTTERWAVE_SECRET_HASH', '').strip()
    secret_key = os.environ.get('FLUTTERWAVE_SECRET_KEY', '').strip()
    if not secret_hash or not secret_key:
        return JsonResponse({'error': 'Flutterwave webhook is not configured'}, status=503)

    signature = request.headers.get('verif-hash', '')
    if not hmac.compare_digest(signature.encode(), secret_hash.encode()):
        return JsonResponse({'error': 'Invalid webhook signature'}, status=401)

    event = parse_json(request)
    data = event.get('data') or {}
    if event.get('event') != 'charge.completed' or not data.get('id'):
        return JsonResponse({'received': True, 'ignored': True})

    # Never trust the webhook body itself: re-read the transaction from Flutterwave.
    try:
        result = _fetch_flutterwave_transaction(secret_key, data['id'])
    except Exception as exc:
        return JsonResponse({'error': f'Flutterwave verification failed: {exc}'}, status=502)
    if result.get('status') != 'success':
        return JsonResponse({'received': True, 'ignored': True, 'reason': 'not verified'})

    try:
        sub = _apply_flutterwave_transaction(result.get('data') or {})
    except ValueError as exc:
        # 200 so Flutterwave stops retrying a payment we will never accept.
        return JsonResponse({'received': True, 'ignored': True, 'reason': str(exc)})

    return JsonResponse({'received': True, **sub.to_dict()})


