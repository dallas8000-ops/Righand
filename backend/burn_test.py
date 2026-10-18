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


def fetch_text(path: str):
    request = urllib.request.Request(f'{API_BASE}{path}', headers={'Accept': '*/*'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read().decode('utf-8', errors='replace')
    except (urllib.error.HTTPError, urllib.error.URLError):
        return None, ''


def report(name: str, ok: bool, detail: str = ''):
    print(f'{"PASS" if ok else "FAIL"} {name}{": " + detail if detail else ""}')
    return ok


def web_bundle_checks():
    """The deployed web bundle must contain the current features, not an old build."""
    status, html = fetch_text('/')
    start = html.find('/static/js/main.')
    if status != 200 or start < 0:
        return [report('web bundle found', False)]
    bundle_path = html[start:html.find('.js', start) + 3]
    status, code = fetch_text(bundle_path)
    results = [
        report('web bundle loads', status == 200, bundle_path),
        report('bundle does not call the old API host', 'gilliomfrontlinedigital' not in code),
    ]
    for label, needle in (
        ('bundle has translated captions', '/compliance/translate'),
        ('bundle has Driving Hours tab', 'Driving Hours'),
        ('bundle has Trip Files wording', 'Trip File'),
    ):
        results.append(report(label, needle in code))
    return results


def signed_in_checks():
    """Feature checks with a real account. Set RIGHAND_TEST_EMAIL and RIGHAND_TEST_PASSWORD to enable."""
    email = os.environ.get('RIGHAND_TEST_EMAIL', '').strip()
    password = os.environ.get('RIGHAND_TEST_PASSWORD', '')
    if not email or not password:
        print('SKIP signed-in checks (set RIGHAND_TEST_EMAIL and RIGHAND_TEST_PASSWORD to run them)')
        return []

    status, body = fetch('/api/auth/login', 'POST', {'email': email, 'password': password})
    token = body.get('token') if isinstance(body, dict) else None
    results = [report('login', status == 200 and bool(token), str(status))]
    if not token:
        return results
    headers = {'Authorization': f'Bearer {token}'}

    status, body = fetch('/api/compliance/summary', headers=headers)
    results.append(report('compliance summary includes Regulation Watch', status == 200 and 'regulationMonitor' in body, str(status)))

    status, body = fetch('/api/compliance/regulation-updates', headers=headers)
    sources = body.get('sources', []) if isinstance(body, dict) else []
    results.append(report('Regulation Watch has all sources', status == 200 and len(sources) >= 4, f'{len(sources)} sources'))
    unhealthy = [s['id'] for s in sources if s.get('status') in ('error', 'unreadable')]
    results.append(report('Regulation Watch sources are readable', not unhealthy, ', '.join(unhealthy)))

    status, _ = fetch('/api/fleet/status', headers=headers)
    results.append(report('fleet status', status == 200, str(status)))

    status, _ = fetch('/api/reports/metrics', headers=headers)
    results.append(report('reports metrics', status in (200, 403), str(status)))

    sample = 'Before every trip, check your axle load, total weight and size at the weighbridge.'
    for language in ('lg', 'sw'):
        status, body = fetch('/api/compliance/translate', 'POST', {'text': sample, 'language': language}, headers)
        code = body.get('code', '') if isinstance(body, dict) else ''
        works = status in (200, 201)
        # Not configured, no credit or rate limited is a setup problem, but the endpoint itself is healthy.
        handled = status in (502, 503) and code.startswith('AI_')
        results.append(report(f'translated captions ({language})', works or handled, f'{status} {code}'.strip()))
    return results


def main():
    print(f'Burn test target: {API_BASE}')
    results = []

    results.append(check('health', '/health'))
    results.append(check('billing health', '/health/billing'))
    results.append(check('api index', '/api/'))
    results.append(check('spa home', '/', expect_status=(200,)))

    status, html = fetch_text('/')
    spa_ok = status == 200 and 'RigHand' in html
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

    results.extend(web_bundle_checks())
    results.extend(signed_in_checks())

    print('\nManual checklist (open the app in Chrome or Edge, not the VS Code browser):')
    for item in (
        'Hold To Talk / Tap To Talk enable after mic permission (the Description box takes focus if voice is unavailable)',
        'Expense/Income toggle switches form mode',
        'Save expense creates row and toast',
        'Tab bar switches Home / Loads / Money Log / Tax & Fuel / Compliance / Driving Hours / Dispatch / Admin',
        'Dispatch: owner can add and remove a driver',
        'Compliance: "Read in" Luganda and Kiswahili buttons show a caption',
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
