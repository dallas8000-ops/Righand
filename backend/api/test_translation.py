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

    def _post(self, text=RULE_TEXT):
        return self.client.post('/api/compliance/translate', {'text': text}, content_type='application/json', **self.headers)

    def test_requires_login(self):
        response = self.client.post('/api/compliance/translate', {'text': RULE_TEXT}, content_type='application/json')
        self.assertIn(response.status_code, (401, 403))

    def test_short_text_rejected(self):
        self.assertEqual(self._post('hi').status_code, 400)

    @mock.patch.dict('os.environ', {'OPENAI_API_KEY': ''})
    def test_not_configured_returns_503(self):
        response = self._post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['code'], 'AI_NOT_CONFIGURED')

    def test_translates_then_serves_from_cache(self):
        with mock.patch('api.views.translation.translate_to_luganda', return_value=('Luganda text', 'English summary.')) as call:
            first = self._post()
            second = self._post()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()['luganda'], 'Luganda text')
        self.assertFalse(first.json()['cached'])
        self.assertTrue(second.json()['cached'])
        self.assertEqual(call.call_count, 1)

    def test_provider_failure_returns_502(self):
        with mock.patch('api.views.translation.translate_to_luganda', side_effect=service.TranslationFailed()):
            self.assertEqual(self._post().status_code, 502)

    def test_quota_and_auth_failures_get_clear_codes(self):
        cases = {'429 insufficient_quota insufficient_quota': 'AI_QUOTA', '401 invalid_request_error invalid_api_key': 'AI_AUTH', '429 requests': 'AI_RATE_LIMIT'}
        for reason, code in cases.items():
            with mock.patch('api.views.translation.translate_to_luganda', side_effect=service.TranslationFailed(reason)):
                response = self._post()
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.json()['code'], code, reason)

    def test_daily_limit_applies_only_to_new_translations(self):
        with mock.patch('api.views.translation.DAILY_NEW_TRANSLATIONS_PER_USER', 2), \
                mock.patch('api.views.translation.translate_to_luganda', return_value=('L', 'E.')) as call:
            self.assertEqual(self._post(RULE_TEXT + ' one').status_code, 201)
            self.assertEqual(self._post(RULE_TEXT + ' two').status_code, 201)
            self.assertEqual(self._post(RULE_TEXT + ' three').status_code, 429)
            self.assertEqual(self._post(RULE_TEXT + ' one').status_code, 200)
        self.assertEqual(call.call_count, 2)
        self.assertEqual(TranslationCache.objects.count(), 2)


class TranslationServiceTests(TestCase):
    @mock.patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_parses_json_reply(self):
        reply = mock.Mock()
        reply.json.return_value = {'choices': [{'message': {'content': '{"luganda": "Ekyokulabirako", "englishSummary": "Example."}'}}]}
        with mock.patch('api.translation_service.requests.post', return_value=reply) as post:
            self.assertEqual(service.translate_to_luganda(RULE_TEXT), ('Ekyokulabirako', 'Example.'))
        sent = post.call_args.kwargs['json']['messages'][1]['content']
        self.assertEqual(sent, f'<text>{RULE_TEXT}</text>')

    @mock.patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_empty_fields_are_a_failure(self):
        reply = mock.Mock()
        reply.json.return_value = {'choices': [{'message': {'content': '{"luganda": "", "englishSummary": "x"}'}}]}
        with mock.patch('api.translation_service.requests.post', return_value=reply):
            with self.assertRaises(service.TranslationFailed):
                service.translate_to_luganda(RULE_TEXT)

    def test_text_is_capped_and_whitespace_normalised(self):
        self.assertEqual(service.normalize_text('a   b\n\nc'), 'a b c')
        self.assertEqual(len(service.normalize_text('x' * 5000)), service.MAX_SOURCE_CHARS)
