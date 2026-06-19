"""Subscription helpers: subscriber IDs, purchase event logging, milestones."""

import os
from datetime import datetime, timedelta, timezone

from django.db import transaction

from api.models import PurchaseEvent, Subscription, User
from fleet_service import ensure_fleet_for_owner
from webhook_client import emit_righand_event

TIER_PRICES = {
    'free': 0.0,
    'pro': 34.99,
    'fleet': 89.0,
}

TIER_RANK = {'free': 0, 'pro': 1, 'fleet': 2}

WEBHOOK_EVENT_MAP = {
    'purchase': 'purchase_pro',
    'upgrade': 'purchase_pro',
    'renew': 'renewal_pro',
    'downgrade': 'cancel_pro',
    'cancel': 'cancel_pro',
}


def catalog_product_ids():
    return {
        'pro': os.environ.get('GOOGLE_PRODUCT_PRO', 'righand_pro_monthly'),
        'fleet': os.environ.get('GOOGLE_PRODUCT_FLEET', 'righand_fleet_monthly'),
    }


def catalog_stripe_price_ids():
    return {
        'pro': os.environ.get('STRIPE_PRICE_ID_PRO', ''),
        'fleet': os.environ.get('STRIPE_PRICE_ID_FLEET', ''),
    }


def _product_catalog():
    ids = catalog_product_ids()
    return {
        ids['pro']: ('pro', TIER_PRICES['pro']),
        ids['fleet']: ('fleet', TIER_PRICES['fleet']),
        'pro': ('pro', TIER_PRICES['pro']),
        'fleet': ('fleet', TIER_PRICES['fleet']),
    }


def resolve_product(product_id: str):
    catalog = _product_catalog()
    key = (product_id or '').strip()
    if key not in catalog:
        return None
    return catalog[key]


def resolve_stripe_price(price_id: str):
    prices = catalog_stripe_price_ids()
    key = (price_id or '').strip()
    for tier, configured_price in prices.items():
        if configured_price and key == configured_price:
            return tier, TIER_PRICES[tier]
    return None


def utcnow():
    return datetime.now(timezone.utc)


def next_subscriber_id() -> str:
    last = Subscription.objects.order_by('-id').first()
    num = (last.id if last else 0) + 1
    return f'RH-{num:05d}'


def get_or_create_subscription(user_id: str) -> Subscription:
    sub = Subscription.objects.filter(user_id=user_id).first()
    if sub:
        return sub
    sub = Subscription(
        user_id=user_id,
        subscriber_id=next_subscriber_id(),
        tier='free',
        started_at=utcnow(),
    )
    sub.save()
    return sub


def find_purchase_by_order(google_order_id: str):
    if not google_order_id:
        return None
    return PurchaseEvent.objects.filter(google_order_id=google_order_id).first()


def log_purchase_event(
    sub: Subscription,
    event_type: str,
    tier: str,
    amount: float,
    google_order_id=None,
    google_product_id=None,
) -> PurchaseEvent:
    event = PurchaseEvent(
        subscription_id=sub.id,
        subscriber_id=sub.subscriber_id,
        event_type=event_type,
        tier=tier,
        amount=amount,
        google_order_id=google_order_id,
        google_product_id=google_product_id,
        occurred_at=utcnow(),
    )
    event.save()
    return event


def subscriber_payload(user: User, sub: Subscription, amount: float = None) -> dict:
    price = amount if amount is not None else TIER_PRICES.get(sub.tier, 0)
    return {
        'subscriber_id': sub.subscriber_id,
        'user_id': user.id,
        'email': user.email,
        'name': user.name,
        'tier': sub.tier,
        'active': sub.tier in ('pro', 'fleet'),
        'current_price': price,
        'pro_started_at': sub.pro_started_at.isoformat() if sub.pro_started_at else None,
        'free_updates_used': sub.free_updates_used,
    }


def emit_for_event(event_type: str, user: User, sub: Subscription, amount: float):
    webhook_event = WEBHOOK_EVENT_MAP.get(event_type)
    if event_type in ('purchase', 'upgrade', 'renew') and sub.tier == 'fleet':
        webhook_event = 'purchase_fleet' if event_type == 'purchase' else 'renewal_fleet'
    elif event_type == 'cancel' and sub.tier == 'free':
        webhook_event = 'cancel_fleet' if amount >= 99 else 'cancel_pro'

    if webhook_event:
        emit_righand_event(webhook_event, subscriber_payload(user, sub, amount))


def apply_tier_upgrade(
    user: User,
    tier: str,
    amount: float,
    google_order_id=None,
    google_product_id=None,
) -> Subscription:
    if tier not in ('pro', 'fleet'):
        raise ValueError(f'Invalid tier: {tier}')

    if google_order_id and find_purchase_by_order(google_order_id):
        return get_or_create_subscription(user.id)

    sub = get_or_create_subscription(user.id)
    now = utcnow()
    prev_tier = sub.tier

    if TIER_RANK.get(tier, 0) <= TIER_RANK.get(prev_tier, 0) and prev_tier in ('pro', 'fleet'):
        return sub

    event_type = 'purchase' if prev_tier == 'free' else 'upgrade'
    sub.tier = tier
    sub.pro_started_at = now
    sub.milestone_notified = False
    sub.save()

    log_purchase_event(sub, event_type, tier, amount, google_order_id, google_product_id)

    if tier == 'fleet':
        ensure_fleet_for_owner(user)

    emit_for_event(event_type, user, sub, amount)
    check_milestones()
    return sub


def apply_purchase_by_product(
    user: User,
    product_id: str,
    google_order_id=None,
    google_product_id=None,
) -> Subscription:
    resolved = resolve_product(product_id)
    if not resolved:
        raise ValueError(f'Unknown product: {product_id}')
    tier, amount = resolved
    pid = google_product_id or product_id
    return apply_tier_upgrade(user, tier, amount, google_order_id, pid)


def apply_stripe_checkout_completed(session: dict) -> Subscription:
    metadata = session.get('metadata') or {}
    user_id = metadata.get('user_id') or metadata.get('userId')
    tier = metadata.get('tier')
    price_id = metadata.get('price_id') or metadata.get('priceId')
    session_id = session.get('id')

    if not tier and price_id:
        resolved = resolve_stripe_price(price_id)
        if resolved:
            tier, _amount = resolved

    if tier not in ('pro', 'fleet'):
        raise ValueError('Stripe checkout session is missing a valid tier')

    user = None
    if user_id:
        user = User.objects.filter(pk=user_id).first()
    if not user:
        customer_details = session.get('customer_details') or {}
        email = customer_details.get('email') or session.get('customer_email')
        if email:
            user = User.objects.filter(email=email).first()
    if not user:
        raise ValueError('Stripe checkout session does not match a RigHand user')

    amount = TIER_PRICES[tier]
    return apply_tier_upgrade(
        user,
        tier,
        amount,
        google_order_id=session_id,
        google_product_id=price_id or f'stripe_{tier}',
    )


def check_milestones():
    cutoff = utcnow() - timedelta(days=90)
    subs = Subscription.objects.filter(
        tier__in=('pro', 'fleet'),
        pro_started_at__isnull=False,
        milestone_notified=False,
    )

    for sub in subs:
        started = sub.pro_started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if started > cutoff:
            continue

        user = User.objects.filter(pk=sub.user_id).first()
        if not user:
            continue
        price = TIER_PRICES.get(sub.tier, TIER_PRICES['pro'])
        if emit_righand_event('milestone_3mo', subscriber_payload(user, sub, price)):
            sub.milestone_notified = True
            sub.save()
