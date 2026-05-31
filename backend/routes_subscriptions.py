"""Subscription purchase tracking, verification, and dbops webhook emission."""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import db, User, Subscription, PurchaseEvent
from subscription_service import (
    TIER_PRICES,
    apply_purchase_by_product,
    apply_tier_upgrade,
    catalog_product_ids,
    check_milestones,
    emit_for_event,
    get_or_create_subscription,
    log_purchase_event,
    resolve_product,
    utcnow,
)

subscriptions_bp = Blueprint('subscriptions', __name__, url_prefix='/api/subscriptions')


@subscriptions_bp.route('/me', methods=['GET'])
@jwt_required()
def my_subscription():
    user_id = get_jwt_identity()
    check_milestones()
    sub = get_or_create_subscription(user_id)
    db.session.commit()
    payload = sub.to_dict()
    products = catalog_product_ids()
    payload['products'] = {
        'pro': {'productId': products['pro'], 'price': TIER_PRICES['pro']},
        'fleet': {'productId': products['fleet'], 'price': TIER_PRICES['fleet']},
    }
    return jsonify(payload), 200


@subscriptions_bp.route('/events', methods=['GET'])
@jwt_required()
def my_purchase_events():
    user_id = get_jwt_identity()
    sub = get_or_create_subscription(user_id)
    db.session.commit()
    events = (
        PurchaseEvent.query.filter_by(subscription_id=sub.id)
        .order_by(PurchaseEvent.occurred_at.desc())
        .limit(100)
        .all()
    )
    return jsonify({'subscriberId': sub.subscriber_id, 'events': [e.to_dict() for e in events]}), 200


@subscriptions_bp.route('/verify-purchase', methods=['POST'])
@jwt_required()
def verify_purchase():
    """
    Unlock Pro or Fleet after Google Play (or other store) payment.

    Body: {
      "productId": "righand_pro_monthly",
      "googleOrderId": "GPA.xxxx",
      "googleProductId": "optional",
      "purchaseToken": "optional — server-side Play verify later"
    }
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    body = request.get_json() or {}
    product_id = body.get('productId') or body.get('product_id') or body.get('tier')
    google_order_id = body.get('googleOrderId') or body.get('google_order_id')
    google_product_id = body.get('googleProductId') or body.get('google_product_id')

    if not product_id:
        return jsonify({'error': 'productId required'}), 400
    if not google_order_id:
        return jsonify({'error': 'googleOrderId required (store transaction ID)'}), 400

    if not resolve_product(product_id):
        return jsonify({'error': f'Unknown product: {product_id}'}), 400

    try:
        sub = apply_purchase_by_product(user, product_id, google_order_id, google_product_id)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({
        'message': 'Purchase verified — features unlocked',
        'tier': sub.tier,
        **sub.to_dict(),
    }), 200


@subscriptions_bp.route('/activate', methods=['POST'])
@jwt_required()
def activate_subscription():
    """Upgrade to Pro or Fleet (manual / testing — prefer verify-purchase in production)."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    body = request.get_json() or {}
    tier = body.get('tier', 'pro')
    if tier not in ('pro', 'fleet'):
        return jsonify({'error': 'Invalid tier — use pro or fleet'}), 400

    amount = float(body.get('amount', TIER_PRICES[tier]))
    google_order_id = body.get('google_order_id') or body.get('googleOrderId')
    google_product_id = body.get('google_product_id') or body.get('googleProductId')

    sub = get_or_create_subscription(user_id)
    if sub.tier == tier:
        db.session.commit()
        return jsonify({'message': f'Already on {tier}', **sub.to_dict()}), 200

    sub = apply_tier_upgrade(user, tier, amount, google_order_id, google_product_id)
    return jsonify({'message': f'Subscription activated ({tier})', **sub.to_dict()}), 201


@subscriptions_bp.route('/renew', methods=['POST'])
@jwt_required()
def renew_subscription():
    """Record a subscription renewal (e.g. Google Play rebill)."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    sub = get_or_create_subscription(user_id)

    if sub.tier not in ('pro', 'fleet'):
        return jsonify({'error': 'No active paid subscription'}), 400

    body = request.get_json() or {}
    amount = float(body.get('amount', TIER_PRICES.get(sub.tier, TIER_PRICES['pro'])))
    google_order_id = body.get('google_order_id') or body.get('googleOrderId')
    google_product_id = body.get('google_product_id') or body.get('googleProductId')

    log_purchase_event(
        sub, 'renew', sub.tier, amount, google_order_id, google_product_id
    )
    db.session.commit()

    emit_for_event('renew', user, sub, amount)
    return jsonify({'message': 'Renewal recorded', **sub.to_dict()}), 200


@subscriptions_bp.route('/cancel', methods=['POST'])
@jwt_required()
def cancel_subscription():
    """Downgrade to free tier after cancellation."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    sub = Subscription.query.filter_by(user_id=user_id).first()

    if not sub or sub.tier not in ('pro', 'fleet'):
        return jsonify({'error': 'No active paid subscription'}), 404

    prev_amount = TIER_PRICES.get(sub.tier, 0)
    log_purchase_event(sub, 'cancel', 'free', 0.0)
    sub.tier = 'free'
    db.session.commit()

    emit_for_event('cancel', user, sub, prev_amount)
    return jsonify({'message': 'Subscription cancelled', **sub.to_dict()}), 200


@subscriptions_bp.route('/update-used', methods=['POST'])
@jwt_required()
def record_free_update():
    """Track free-tier app updates consumed."""
    user_id = get_jwt_identity()
    sub = get_or_create_subscription(user_id)
    sub.free_updates_used = (sub.free_updates_used or 0) + 1
    db.session.commit()
    return jsonify(sub.to_dict()), 200
