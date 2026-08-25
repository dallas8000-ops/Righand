import os
import uuid

import requests as _requests

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

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
    get_or_create_subscription,
    log_purchase_event,
    resolve_product,
    utcnow,
)


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
    google_order_id = body.get('googleOrderId') or body.get('google_order_id')
    google_product_id = body.get('googleProductId') or body.get('google_product_id')

    if not product_id:
        return JsonResponse({'error': 'productId required'}, status=400)
    if not google_order_id:
        return JsonResponse({'error': 'googleOrderId required (store transaction ID)'}, status=400)
    if not resolve_product(product_id):
        return JsonResponse({'error': f'Unknown product: {product_id}'}, status=400)

    try:
        sub = apply_purchase_by_product(user, product_id, google_order_id, google_product_id)
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

    frontend_url = (
        body.get('frontendUrl')
        or os.environ.get('RIGHAND_FRONTEND_URL')
        or request.headers.get('Origin')
        or request.build_absolute_uri('/').rstrip('/')
    ).rstrip('/')
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
    amount = TIER_PRICES[tier]
    currency = os.environ.get('FLUTTERWAVE_CURRENCY', 'USD')

    frontend_url = (
        body.get('frontendUrl')
        or os.environ.get('RIGHAND_FRONTEND_URL')
        or request.headers.get('Origin')
        or request.build_absolute_uri('/').rstrip('/')
    ).rstrip('/')

    tx_ref = f'RH-{sub.subscriber_id}-{int(utcnow().timestamp())}-{uuid.uuid4().hex[:6]}'

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
            'description': f'${amount:.2f}/month subscription',
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
            'https://api.flutterwave.com/v3/payments',
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
        resp = _requests.get(
            f'https://api.flutterwave.com/v3/transactions/{transaction_id}/verify',
            headers={'Authorization': f'Bearer {secret_key}'},
            timeout=10,
        )
        result = resp.json()
    except Exception as exc:
        return JsonResponse({'error': f'Flutterwave verification failed: {exc}'}, status=502)

    if result.get('status') != 'success':
        msg = result.get('message', 'Payment not verified')
        return JsonResponse({'error': f'Flutterwave: {msg}', 'verified': False}, status=400)

    data = result.get('data', {})
    if data.get('status') != 'successful':
        return JsonResponse({'error': 'Payment was not successful', 'verified': False}, status=400)

    meta = data.get('meta') or {}
    tier = meta.get('tier') or body.get('tier', 'pro')
    if tier not in ('pro', 'fleet'):
        tier = 'pro'

    amount = float(data.get('amount', TIER_PRICES[tier]))
    google_order_id = str(transaction_id)

    try:
        sub = apply_tier_upgrade(user, tier, amount, google_order_id=google_order_id,
                                  google_product_id=f'flutterwave_{tier}')
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)

    return JsonResponse({
        'message': 'Payment verified — features unlocked',
        'verified': True,
        'tier': sub.tier,
        **sub.to_dict(),
    })
