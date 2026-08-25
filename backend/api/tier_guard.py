"""Subscription tier checks for API route protection."""

from functools import wraps

from django.http import JsonResponse

from subscription_service import get_or_create_subscription, is_trial_active

PRO_TIERS = frozenset({'pro', 'fleet'})
FLEET_TIERS = frozenset({'fleet'})


def user_tier(user_id: str) -> str:
    sub = get_or_create_subscription(user_id)
    return sub.tier or 'free'


def user_has_pro(user_id: str) -> bool:
    return user_tier(user_id) in PRO_TIERS


def user_has_fleet_sub(user_id: str) -> bool:
    return user_tier(user_id) in FLEET_TIERS


def user_has_pro_or_trial(user_id: str) -> bool:
    sub = get_or_create_subscription(user_id)
    return sub.tier in PRO_TIERS or is_trial_active(sub)


def require_pro(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        user_id = getattr(request, 'righand_user_id', None)
        if not user_has_pro_or_trial(user_id):
            return JsonResponse({
                'error': 'Pro subscription required',
                'code': 'PRO_REQUIRED',
                'upgradeUrl': '/upgrade/pro',
                'trialExpired': True,
            }, status=403)
        return view_func(request, *args, **kwargs)

    return wrapper
