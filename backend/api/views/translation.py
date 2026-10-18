from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import TranslationCache
from api.translation_service import (
    TranslationFailed,
    TranslationUnavailable,
    cache_key,
    normalize_text,
    translate_to_luganda,
)
from api.utils import parse_json

DAILY_NEW_TRANSLATIONS_PER_USER = 30
DISCLAIMER = 'AI translation. Check the official source before relying on it.'


def _caption_payload(row, cached):
    return {
        'success': True,
        'luganda': row.luganda,
        'englishSummary': row.english_summary,
        'cached': cached,
        'disclaimer': DISCLAIMER,
    }


@jwt_required
@require_http_methods(['POST'])
def translate_compliance_text(request):
    user_id = request.righand_user_id
    text = normalize_text(parse_json(request).get('text'))
    if len(text) < 10:
        return JsonResponse({'error': 'Text is required'}, status=400)

    key = cache_key(text)
    row = TranslationCache.objects.filter(pk=key).first()
    if row:
        return JsonResponse(_caption_payload(row, True))

    since = timezone.now() - timedelta(days=1)
    if TranslationCache.objects.filter(user_id=user_id, created_at__gte=since).count() >= DAILY_NEW_TRANSLATIONS_PER_USER:
        return JsonResponse({'error': 'Daily translation limit reached. Try again tomorrow.', 'code': 'LIMIT'}, status=429)

    try:
        luganda, summary = translate_to_luganda(text)
    except TranslationUnavailable:
        return JsonResponse({'error': 'Luganda captions are not switched on yet.', 'code': 'AI_NOT_CONFIGURED'}, status=503)
    except TranslationFailed:
        return JsonResponse({'error': 'Translation is unavailable right now. Please try again.', 'code': 'AI_FAILED'}, status=502)

    row, _ = TranslationCache.objects.get_or_create(
        pk=key,
        defaults={'source_text': text, 'luganda': luganda, 'english_summary': summary, 'user_id': user_id},
    )
    return JsonResponse(_caption_payload(row, False), status=201)
