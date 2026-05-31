"""Subscription tier checks for API route protection."""

from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from subscription_service import get_or_create_subscription

PRO_TIERS = frozenset({'pro', 'fleet'})
FLEET_TIERS = frozenset({'fleet'})


def user_tier(user_id: str) -> str:
    sub = get_or_create_subscription(user_id)
    return sub.tier or 'free'


def user_has_pro(user_id: str) -> bool:
    return user_tier(user_id) in PRO_TIERS


def user_has_fleet_sub(user_id: str) -> bool:
    return user_tier(user_id) in FLEET_TIERS


def require_pro(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        if not user_has_pro(user_id):
            return jsonify({
                'error': 'Pro subscription required',
                'code': 'PRO_REQUIRED',
                'upgradeUrl': '/upgrade/pro',
            }), 403
        return fn(*args, **kwargs)
    return wrapper
