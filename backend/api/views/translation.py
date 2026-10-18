from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import TranslationCache
from api.translation_service import (
    LANGUAGES,
    TranslationFailed,
    TranslationUnavailable,
    cache_key,
    normalize_text,
    translate_text,
)
from api.utils import parse_json

DAILY_NEW_TRANSLATIONS_PER_USER = 30
DISCLAIMER = 'AI translation. Check the official source before relying on it.'


def _caption_payload(row, language, cached):
    payload = {
        'success': True,
        'language': language,
        'languageName': LANGUAGES[language],
        'translation': row.translation,
        'englishSummary': row.english_summary,
        'cached': cached,
        'disclaimer': DISCLAIMER,
    }
    if language == 'lg':
        payload['luganda'] = row.translation
    return payload


def _provider_failure_response(reason):
    if 'insufficient_quota' in reason:
        return JsonResponse({
            'error': 'The OpenAI account behind this key has no credit left. Add credit or a spending limit in the OpenAI billing page.',
            'code': 'AI_QUOTA',
        }, status=502)
    if reason.startswith('401'):
        return JsonResponse({'error': 'The OpenAI key was rejected. Check OPENAI_API_KEY in Railway.', 'code': 'AI_AUTH'}, status=502)
    if reason.startswith('429'):
        return JsonResponse({'error': 'OpenAI is rate limiting this key. Try again in a minute.', 'code': 'AI_RATE_LIMIT'}, status=502)
    return JsonResponse({'error': 'Translation is unavailable right now. Please try again.', 'code': 'AI_FAILED'}, status=502)


@jwt_required
@require_http_methods(['POST'])
def translate_compliance_text(request):
    user_id = request.righand_user_id
    data = parse_json(request)
    text = normalize_text(data.get('text'))
    language = (data.get('language') or 'lg').strip().lower()
    if language not in LANGUAGES:
        return JsonResponse({'error': 'Language must be one of: ' + ', '.join(LANGUAGES)}, status=400)
    if len(text) < 10:
        return JsonResponse({'error': 'Text is required'}, status=400)

    key = cache_key(text, language)
    row = TranslationCache.objects.filter(pk=key).first()
    if row:
        return JsonResponse(_caption_payload(row, language, True))

    since = timezone.now() - timedelta(days=1)
    if TranslationCache.objects.filter(user_id=user_id, created_at__gte=since).count() >= DAILY_NEW_TRANSLATIONS_PER_USER:
        return JsonResponse({'error': 'Daily translation limit reached. Try again tomorrow.', 'code': 'LIMIT'}, status=429)

    try:
        translation, summary = translate_text(text, language)
    except TranslationUnavailable:
        return JsonResponse({'error': 'Translated captions are not switched on yet.', 'code': 'AI_NOT_CONFIGURED'}, status=503)
    except TranslationFailed as exc:
        return _provider_failure_response(exc.reason)

    row, _ = TranslationCache.objects.get_or_create(
        pk=key,
        defaults={'source_text': text, 'translation': translation, 'english_summary': summary, 'user_id': user_id},
    )
    return JsonResponse(_caption_payload(row, language, False), status=201)
