"""Regression tests: the RigHand event receiver and admin endpoints must fail closed."""

import os
import tempfile
import unittest
from unittest import mock

from flask import Flask

from righand_webhook import righand_webhook_bp

EVENTS = '/api/webhooks/righand'
LIST = '/api/webhooks/righand/events'
SUMMARY = '/api/webhooks/righand/summary'


def make_client():
    app = Flask(__name__)
    app.register_blueprint(righand_webhook_bp)
    return app.test_client()


class WebhookAuthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix='.jsonl', delete=False)
        self.tmp.close()
        os.unlink(self.tmp.name)
        self.client = make_client()

    def tearDown(self):
        if os.path.exists(self.tmp.name):
            os.unlink(self.tmp.name)

    def _env(self, **overrides):
        env = {'DBOPS_WEBHOOK_SECRET': '', 'ADMIN_SECRET': '', 'RIGHAND_LOG_PATH': self.tmp.name}
        env.update(overrides)
        return mock.patch.dict(os.environ, env)

    # --- event receiver -------------------------------------------------------

    def test_event_rejected_when_secret_unset(self):
        with self._env():
            r = self.client.post(EVENTS, json={'event': 'purchase_pro', 'data': {}})
        self.assertEqual(r.status_code, 401)
        self.assertFalse(os.path.exists(self.tmp.name), 'nothing may be written to the log')

    def test_event_rejected_with_wrong_secret(self):
        with self._env(DBOPS_WEBHOOK_SECRET='right'):
            r = self.client.post(EVENTS, json={'event': 'x'}, headers={'X-Webhook-Secret': 'wrong'})
        self.assertEqual(r.status_code, 401)

    def test_event_accepted_with_correct_secret(self):
        with self._env(DBOPS_WEBHOOK_SECRET='right'):
            r = self.client.post(EVENTS, json={'event': 'purchase_pro', 'data': {'subscriber_id': 's1'}},
                                 headers={'X-Webhook-Secret': 'right'})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(os.path.exists(self.tmp.name))

    def test_event_rejects_non_object_body(self):
        with self._env(DBOPS_WEBHOOK_SECRET='right'):
            r = self.client.post(EVENTS, json=['not', 'an', 'object'], headers={'X-Webhook-Secret': 'right'})
        self.assertEqual(r.status_code, 400)

    # --- admin endpoints ------------------------------------------------------

    def test_admin_rejects_empty_header_when_secret_unset(self):
        """The original bug: '' == '' granted access when ADMIN_SECRET was unset."""
        with self._env():
            for path in (LIST, SUMMARY):
                r = self.client.get(path, headers={'X-Admin-Secret': ''})
                self.assertEqual(r.status_code, 401, path)
                r = self.client.get(path)
                self.assertEqual(r.status_code, 401, path)

    def test_admin_rejects_wrong_secret(self):
        with self._env(ADMIN_SECRET='admin'):
            for path in (LIST, SUMMARY):
                r = self.client.get(path, headers={'X-Admin-Secret': 'nope'})
                self.assertEqual(r.status_code, 401, path)

    def test_admin_accepts_correct_secret(self):
        with self._env(ADMIN_SECRET='admin'):
            for path in (LIST, SUMMARY):
                r = self.client.get(path, headers={'X-Admin-Secret': 'admin'})
                self.assertEqual(r.status_code, 200, path)


if __name__ == '__main__':
    unittest.main()
