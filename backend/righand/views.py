import importlib.util
import os

from django.conf import settings
from django.http import FileResponse, JsonResponse


def health(request):
    return JsonResponse({
        'status': 'healthy',
        'service': 'RigHand AI Backend',
        'version': '1.0.0',
    })


def _env_configured(name):
    return bool(os.environ.get(name, '').strip())


def billing_health(request):
    billing = {
        'stripe_secret_key': _env_configured('STRIPE_SECRET_KEY'),
        'stripe_webhook_secret': _env_configured('STRIPE_WEBHOOK_SECRET'),
        'stripe_price_id_pro': _env_configured('STRIPE_PRICE_ID_PRO'),
        'stripe_price_id_fleet': _env_configured('STRIPE_PRICE_ID_FLEET'),
        'stripe_sdk_installed': importlib.util.find_spec('stripe') is not None,
    }
    required = (
        billing['stripe_secret_key']
        and billing['stripe_webhook_secret']
        and billing['stripe_price_id_pro']
        and billing['stripe_sdk_installed']
    )
    return JsonResponse({
        'status': 'ok' if required else 'missing_config',
        'billing': billing,
        'webhook_url_path': '/api/billing/webhook',
        'checkout_url_path': '/api/subscriptions/stripe-checkout',
        'required_webhook_events': [
            'checkout.session.completed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
        ],
    }, status=200 if required else 503)


def spa_index(request):
    """Serve the React production build (Django hosts the full web app)."""
    index_path = settings.FRONTEND_BUILD_DIR / 'index.html'
    if index_path.is_file():
        return FileResponse(index_path.open('rb'), content_type='text/html')
    return JsonResponse({
        'service': 'Righand API',
        'status': 'online',
        'message': 'Frontend build not found. Run: cd frontend && npm run build',
        'api': '/api/',
    })
