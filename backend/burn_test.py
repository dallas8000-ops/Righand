"""Burn test: API smoke + interactive UI checklist reference."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API_BASE = os.environ.get(
    'RIGHAND_API_URL',
    'https://righand-production.up.railway.app',
).rstrip('/')


def fetch(path: str, method: str = 'GET', body: dict | None = None, headers: dict | None = None):
    url = f'{API_BASE}{path}'
    data = None
    req_headers = {'Accept': 'application/json', **(headers or {})}
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        req_headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode('utf-8', errors='replace')
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {'_raw': raw[:200]}
            return response.status, payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {'_raw': raw[:200]}
        return exc.code, payload
    except urllib.error.URLError as exc:
        return None, {'error': str(exc.reason)}


def check(name: str, path: str, expect_status: int | tuple[int, ...] = 200):
    status, body = fetch(path)
    ok = status in (expect_status if isinstance(expect_status, tuple) else (expect_status,))
    print(f'{"PASS" if ok else "FAIL"} {name}: {status} {path}')
    if not ok:
        print('  ', body)
    return ok


def main():
    print(f'Burn test target: {API_BASE}')
    results = []

    results.append(check('health', '/health'))
    results.append(check('billing health', '/health/billing'))
    results.append(check('api index', '/api/'))
    results.append(check('spa home', '/', expect_status=(200,)))

    status, body = fetch('/')
    spa_ok = status == 200 and isinstance(body.get('_raw'), str) and 'RigHand' in body['_raw']
    print(f'{"PASS" if spa_ok else "FAIL"} spa html contains RigHand: /')
    results.append(spa_ok)

    # Auth-protected routes should reject anonymous access, not hang.
    for path in (
        '/api/expenses/user/developer_user_001',
        '/api/reports/metrics',
        '/api/subscriptions/me',
        '/api/categories',
        '/api/ops/load-packets',
        '/api/fleet/status',
    ):
        status, _ = fetch(path)
        protected_ok = status in (401, 403)
        print(f'{"PASS" if protected_ok else "FAIL"} protected {path}: {status}')
        results.append(protected_ok)

    print('\nManual tablet UI checklist (verify buttons react, not static):')
    for item in (
        'Hold To Talk / Tap To Talk enable after mic permission',
        'Expense/Income toggle switches form mode',
        'Save expense creates row and toast',
        'Tab bar switches Home / Loads / Log / Reports / HOS / Fleet',
        'Theme switcher changes theme',
        'Trip tracker start/stop responds',
        'Logout returns to login screen',
    ):
        print(f'  - {item}')

    if all(results):
        print('\nAll automated burn checks passed.')
        return 0
    print('\nSome automated burn checks failed.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
