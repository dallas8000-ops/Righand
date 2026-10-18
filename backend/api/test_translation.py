import uuid
from unittest import mock

from django.test import TestCase

from api import translation_service as service
from api.jwt_auth import create_access_token
from api.models import TranslationCache, User
from api.schema_migrations import ensure_core_schema

RULE_TEXT = 'Check axle load, gross mass, weighbridge tickets and overload notices before dispatch.'


class TranslationEndpointTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        user = User(id=str(uuid.uuid4()), email='t@example.com', password_hash='x', name='T', trucker_license='T1')
        user.save()
        self.user = user
        self.headers = {'HTTP_AUTHORIZATION': f'Bearer {create_access_token(user.id)}'}

    def _post(self, text=RULE_TEXT, **extra):
        payload = {'text': text, **extra}
        return self.client.post('/api/compliance/translate', payload, content_type='application/json', **self.headers)

    def test_requires_login(self):
        response = self.client.post('/api/compliance/translate', {'text': RULE_TEXT}, content_type='application/json')
        self.assertIn(response.status_code, (401, 403))

    def test_short_text_rejected(self):
        self.assertEqual(self._post('hi').status_code, 400)

    def test_unknown_language_rejected(self):
        self.assertEqual(self._post(language='fr').status_code, 400)

    @mock.patch.dict('os.environ', {'OPENAI_API_KEY': ''})
    def test_not_configured_returns_503(self):
        response = self._post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['code'], 'AI_NOT_CONFIGURED')

    def test_translates_then_serves_from_cache(self):
        with mock.patch('api.views.translation.translate_text', return_value=('Luganda text', 'English summary.')) as call:
            first = self._post()
            second = self._post()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()['translation'], 'Luganda text')
        self.assertEqual(first.json()['luganda'], 'Luganda text')
        self.assertEqual(first.json()['language'], 'lg')
        self.assertFalse(first.json()['cached'])
        self.assertTrue(second.json()['cached'])
        self.assertEqual(call.call_count, 1)

    def test_each_language_is_cached_separately(self):
        replies = {'lg': ('Luganda text', 'Summary.'), 'sw': ('Maandishi ya Kiswahili', 'Summary.')}
        with mock.patch('api.views.translation.translate_text', side_effect=lambda text, lang: replies[lang]) as call:
            lg = self._post(language='lg')
            sw = self._post(language='sw')
            sw_again = self._post(language='sw')
        self.assertEqual(lg.json()['translation'], 'Luganda text')
        self.assertEqual(sw.json()['translation'], 'Maandishi ya Kiswahili')
        self.assertEqual(sw.json()['languageName'], 'Swahili')
        self.assertNotIn('luganda', sw.json())
        self.assertTrue(sw_again.json()['cached'])
        self.assertEqual(call.call_count, 2)

    def test_provider_failure_returns_502(self):
        with mock.patch('api.views.translation.translate_text', side_effect=service.TranslationFailed()):
            self.assertEqual(self._post().status_code, 502)

    def test_quota_and_auth_failures_get_clear_codes(self):
        cases = {'429 insufficient_quota insufficient_quota': 'AI_QUOTA', '401 invalid_request_error invalid_api_key': 'AI_AUTH', '429 requests': 'AI_RATE_LIMIT'}
        for reason, code in cases.items():
            with mock.patch('api.views.translation.translate_text', side_effect=service.TranslationFailed(reason)):
                response = self._post()
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.json()['code'], code, reason)

    def test_daily_limit_applies_only_to_new_translations(self):
        with mock.patch('api.views.translation.DAILY_NEW_TRANSLATIONS_PER_USER', 2), \
                mock.patch('api.views.translation.translate_text', return_value=('L', 'E.')) as call:
            self.assertEqual(self._post(RULE_TEXT + ' one').status_code, 201)
            self.assertEqual(self._post(RULE_TEXT + ' two').status_code, 201)
            self.assertEqual(self._post(RULE_TEXT + ' three').status_code, 429)
            self.assertEqual(self._post(RULE_TEXT + ' one').status_code, 200)
        self.assertEqual(call.call_count, 2)
        self.assertEqual(TranslationCache.objects.count(), 2)


class TranslationServiceTests(TestCase):
    @mock.patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_parses_json_reply_and_names_the_language(self):
        reply = mock.Mock()
        reply.json.return_value = {'choices': [{'message': {'content': '{"translation": "Mfano", "englishSummary": "Example."}'}}]}
        with mock.patch('api.translation_service.requests.post', return_value=reply) as post:
            self.assertEqual(service.translate_text(RULE_TEXT, 'sw'), ('Mfano', 'Example.'))
        messages = post.call_args.kwargs['json']['messages']
        self.assertIn('Swahili', messages[0]['content'])
        self.assertEqual(messages[1]['content'], f'<text>{RULE_TEXT}</text>')

    @mock.patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_empty_fields_are_a_failure(self):
        reply = mock.Mock()
        reply.json.return_value = {'choices': [{'message': {'content': '{"translation": "", "englishSummary": "x"}'}}]}
        with mock.patch('api.translation_service.requests.post', return_value=reply):
            with self.assertRaises(service.TranslationFailed):
                service.translate_text(RULE_TEXT)

    def test_text_is_capped_and_whitespace_normalised(self):
        self.assertEqual(service.normalize_text('a   b\n\nc'), 'a b c')
        self.assertEqual(len(service.normalize_text('x' * 5000)), service.MAX_SOURCE_CHARS)

    def test_cache_key_changes_with_model_and_language(self):
        with mock.patch.dict('os.environ', {'OPENAI_MODEL': 'gpt-4o-mini'}):
            small = service.cache_key(RULE_TEXT, 'lg')
        with mock.patch.dict('os.environ', {'OPENAI_MODEL': 'gpt-4o'}):
            large = service.cache_key(RULE_TEXT, 'lg')
            swahili = service.cache_key(RULE_TEXT, 'sw')
        self.assertNotEqual(small, large)
        self.assertNotEqual(large, swahili)
