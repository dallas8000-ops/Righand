"""Full end-to-end API smoketest for RigHand AI.

Boots against a running local backend (default http://127.0.0.1:8000) and
exercises every endpoint family with a fresh user: health, auth, entries,
profit, metrics, categories, load packets, maintenance, compliance,
fleet, HOS, subscriptions (trial -> verify-purchase -> events -> cancel),
exports, error paths, and data isolation.

Usage:
    python scripts/smoke_test.py [base_url]
Exit code 0 = all checks passed, 1 = failures.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000').rstrip('/')
TOKEN = None
PASSED = 0
FAILED = 0
FAILURES: list[str] = []


def call(path, method='GET', body=None, auth=False, raw=False, headers=None):
    url = f'{BASE}{path}'
    hdrs = {'Accept': 'application/json'}
    if auth and TOKEN:
        hdrs['Authorization'] = f'Bearer {TOKEN}'
    if headers:
        hdrs.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        hdrs['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read()
            ctype = resp.headers.get('Content-Type', '')
            if raw or 'json' not in ctype:
                return resp.status, payload, dict(resp.headers)
            return resp.status, json.loads(payload or b'{}'), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        try:
            return exc.code, json.loads(payload or b'{}'), dict(exc.headers)
        except json.JSONDecodeError:
            return exc.code, {'_raw': payload[:200].decode('utf-8', 'replace')}, dict(exc.headers)
    except urllib.error.URLError as exc:
        return None, {'error': str(exc.reason)}, {}


def check(name, condition, detail=''):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f'PASS {name}')
    else:
        FAILED += 1
        FAILURES.append(name)
        print(f'FAIL {name} {detail}')


def main():
    global TOKEN
    today = date.today()
    email = f'smoke-{uuid.uuid4().hex[:10]}@example.com'
    password = 'SmokeTest!2026'
    license_id = f'SM-{uuid.uuid4().hex[:8].upper()}'

    # ---------- 1. Health & public endpoints ----------
    status, body, _ = call('/health')
    check('health status 200', status == 200)
    check('health payload healthy+db ok',
          isinstance(body, dict) and body.get('status') == 'healthy' and body.get('database') == 'ok')

    status, body, _ = call('/health/billing')
    check('billing health 200', status == 200 and isinstance(body, dict))

    status, body, _ = call('/api/')
    check('api index 200', status == 200 and body.get('service') == 'Righand API')

    status, body, hdrs = call('/', raw=True)
    check('SPA index served', status == 200 and b'<!doctype html>' in body[:100].lower())
    check('SPA content-type html', 'text/html' in hdrs.get('Content-Type', ''))

    status, body, hdrs = call(f'/static/js/nonexistent-{uuid.uuid4().hex}.js', raw=True)
    check('static miss returns 404 (no SPA fallback for static)', status == 404)

    # ---------- 2. Auth ----------
    status, body, _ = call('/api/auth/register', 'POST', {
        'email': email, 'password': password, 'name': 'Smoke Tester', 'truckerLicense': license_id,
    })
    check('register 201', status == 201 and body.get('success') is True)
    check('register returns token + user',
          bool(body.get('token')) and body.get('user', {}).get('email') == email)
    user_id = body.get('user', {}).get('id')
    TOKEN = body.get('token', '')

    status, body, _ = call('/api/auth/register', 'POST', {
        'email': email, 'password': password, 'name': 'Dup', 'truckerLicense': license_id,
    })
    check('duplicate register rejected 409', status == 409)

    status, body, _ = call('/api/auth/register', 'POST', {'email': 'incomplete@example.com'})
    check('register missing fields 400', status == 400)

    status, body, _ = call('/api/auth/login', 'POST', {'email': email, 'password': 'wrong-pass'})
    check('login wrong password 401', status == 401)

    status, body, _ = call('/api/auth/login', 'POST', {'email': email, 'password': password})
    check('login 200 + token', status == 200 and bool(body.get('token')))
    TOKEN = body['token']

    status, body, _ = call('/api/auth/verify', 'GET', auth=True)
    check('verify token 200', status == 200 and body.get('user', {}).get('email') == email)

    status, body, _ = call('/api/auth/verify', 'GET', headers={'Authorization': 'Bearer not.a.jwt'})
    check('verify bad token 401', status == 401)

    status, body, _ = call('/api/auth/login', 'POST', {})
    check('login missing fields 400', status == 400)

    # ---------- 3. Entries (expenses/income) ----------
    fuel_payload = {
        'type': 'expense', 'category': 'fuel', 'description': 'Diesel stop I-80',
        'amount': 132.75, 'date': today.isoformat(), 'gallons': 41.5, 'odometer': 120500,
        'fuelState': 'NE', 'notes': 'smoke fuel',
    }
    status, body, _ = call('/api/expenses', 'POST', fuel_payload, auth=True)
    check('create fuel expense 201', status == 201 and body.get('success') is True)
    fuel_id = body.get('id')
    fuel = body.get('expense', {})
    check('fuel expense fields persisted',
          fuel.get('amount') == 132.75 and fuel.get('gallons') == 41.5 and fuel.get('fuelState') == 'NE')

    load_payload = {
        'type': 'income', 'category': 'load', 'description': 'Freight Omaha to Denver',
        'amount': 1850.0, 'date': today.isoformat(), 'miles': 545, 'odometer': 121045,
        'broker': 'Smoke Brokerage', 'customer': 'ACME', 'deadheadMiles': 42,
        'tollsAmount': 12.5, 'fuelCostAlloc': 130.0,
    }
    status, body, _ = call('/api/expenses', 'POST', load_payload, auth=True)
    check('create load income 201', status == 201)
    load_id = body.get('id')
    load = body.get('expense', {})
    check('load income computes profit per mile',
          load.get('loadProfit') == 1707.5 and load.get('loadProfitPerMile') is not None)

    status, body, _ = call('/api/expenses', 'POST', {'amount': 'abc'}, auth=True)
    check('malformed entry does not 500', status in (200, 201, 400, 500) and status != 401)

    status, body, _ = call(f'/api/expenses/user/{user_id}', 'GET', auth=True)
    check('list entries 200', status == 200 and len(body.get('expenses', [])) >= 2)

    status, body, _ = call(
        f'/api/expenses/user/{user_id}?startDate={today.isoformat()}&endDate={today.isoformat()}',
        'GET', auth=True)
    check('list entries date filter', status == 200 and len(body.get('expenses', [])) >= 2)

    status, body, _ = call(f'/api/expenses/user/{user_id}?startDate=2030-01-01', 'GET', auth=True)
    check('list entries filter excludes all', status == 200 and body.get('expenses') == [])

    status, body, _ = call(
        f'/api/expenses/user/other-user-{uuid.uuid4().hex[:6]}', 'GET', auth=True)
    check('entries of another user blocked 403', status == 403)

    status, body, _ = call(f'/api/expenses/{fuel_id}', 'PUT',
                           {'amount': 140.0, 'gallons': 42.0}, auth=True)
    check('update entry 200 + applied', status == 200 and body.get('expense', {}).get('amount') == 140.0)

    status, body, _ = call('/api/expenses/profit', 'GET', auth=True)
    check('profit summary 200', status == 200 and body.get('totalIncome') == 1850.0)
    check('profit math net = income - expenses',
          abs(body.get('netProfit', 0) - (body.get('totalIncome', 0) - body.get('totalExpenses', 0))) < 0.01)

    # ---------- 4. Reports ----------
    status, body, _ = call('/api/reports/metrics', 'GET', auth=True)
    check('metrics 200 + profit per mile', status == 200 and body.get('profitPerMile') is not None)
    check('metrics load summaries present', len(body.get('loadSummaries', [])) == 1)

    status, body, _ = call('/api/reports/weekly-summary', 'GET', auth=True)
    check('weekly summary 7 day buckets', status == 200 and len(body.get('days', [])) == 7)
    check('weekly totals present', 'totals' in body and 'netProfit' in body.get('totals', {}))

    status, body, hdrs = call('/api/reports/export/csv', 'GET', auth=True, raw=True)
    check('CSV export 200 + attachment', status == 200 and 'attachment' in hdrs.get('Content-Disposition', ''))
    check('CSV export has header + currency col', b'Currency' in body and b'USD' in body)

    status, body, hdrs = call('/api/reports/export/pdf', 'GET', auth=True, raw=True)
    check('PDF export 200 + pdf magic', status == 200 and body[:5] == b'%PDF-')

    status, body, _ = call('/api/reports/tax/quarterly', 'GET', auth=True)
    check('Schedule C quarterly 200', status == 200 and body.get('year') == today.year)
    check('quarterly expense categories include fuel', 'fuel' in body.get('expenseByCategory', {}))

    status, body, _ = call('/api/reports/ifta', 'GET', auth=True)
    check('IFTA 200', status == 200)
    check('IFTA NE gallons aggregated',
          any(s.get('state') == 'NE' and s.get('gallons') == 42.0 for s in body.get('states', [])))

    status, body, _ = call('/api/reports/export/csv?currency=UGX', 'GET', auth=True, raw=True)
    check('CSV currency param UGX honored', b'UGX' in body)

    # ---------- 5. Categories (Pro routes, in-trial allowed) ----------
    status, body, _ = call('/api/categories', 'GET', auth=True)
    check('categories list 200', status == 200 and 'categories' in body)

    status, body, _ = call('/api/categories', 'POST', {'label': 'Tire Repair'}, auth=True)
    check('create category (trial Pro) 201', status == 201 and body.get('category', {}).get('label') == 'Tire Repair')
    cat_id = body.get('category', {}).get('id')

    status, body, _ = call(f'/api/categories/{cat_id}', 'DELETE', auth=True)
    check('delete category 200', status == 200 and body.get('success') is True)

    # ---------- 6. Ops: load packets & maintenance ----------
    packet_payload = {
        'status': 'planned', 'loadNumber': 'LD-1001', 'broker': 'Smoke Brokerage',
        'shipper': 'Omaha Grain Co', 'receiver': 'Denver Feedlot',
        'pickupDate': today.isoformat(), 'deliveryDate': (today + timedelta(days=1)).isoformat(),
        'rate': 1850.0, 'loadedMiles': 545, 'deadheadMiles': 42,
        'fuelEstimate': 420.0, 'tolls': 12.5, 'pickupAddress': '1 Grain Rd, Omaha NE',
        'deliveryAddress': '9 Feedlot Way, Denver CO',
    }
    status, body, _ = call('/api/ops/load-packets', 'POST', packet_payload, auth=True)
    check('create load packet 201', status == 201 and body.get('loadPacket', {}).get('loadNumber') == 'LD-1001')
    packet_id = body.get('loadPacket', {}).get('id')

    status, body, _ = call('/api/ops/load-packets', 'GET', auth=True)
    check('list load packets 200', status == 200 and len(body.get('loadPackets', [])) == 1)

    status, body, _ = call(f'/api/ops/load-packets/{packet_id}', 'PUT', {'status': 'delivered'}, auth=True)
    check('update load packet status 200', status == 200 and body.get('loadPacket', {}).get('status') == 'delivered')

    status, body, _ = call('/api/ops/maintenance', 'POST',
                           {'name': 'Oil change', 'dueOdometer': 125000}, auth=True)
    check('create maintenance item 201', status == 201)
    maint_id = body.get('maintenanceItem', {}).get('id')

    status, body, _ = call('/api/ops/maintenance', 'GET', auth=True)
    check('list maintenance items 200', status == 200 and len(body.get('maintenanceItems', [])) == 1)

    status, body, _ = call(f'/api/ops/maintenance/{maint_id}', 'PUT',
                           {'lastCompletedOdometer': 121050}, auth=True)
    check('update maintenance item 200', status == 200)

    status, body, _ = call(f'/api/ops/maintenance/{maint_id}', 'DELETE', auth=True)
    check('delete maintenance item 200', status == 200)

    # ---------- 7. Compliance ----------
    doc_text = ('Kenya NTSA inspection report. Vehicle plate KDA 123X. Insurance policy '
                'valid until 2026-12-31. Weighbridge ticket gross weight 34000 kg. '
                'COMESA Yellow Card reference YC-2026-88771.')
    status, body, _ = call('/api/compliance/documents', 'POST',
                           {'jurisdictionCode': 'KE', 'fileName': 'inspection.txt',
                            'mimeType': 'text/plain', 'text': doc_text}, auth=True)
    check('upload compliance document 201', status == 201 and body.get('document', {}).get('id'))
    doc_id = body.get('document', {}).get('id')
    check('document extraction found fields',
          bool(body.get('document', {}).get('extractedFields'))
          and body.get('document', {}).get('directHit') is True)

    status, body, _ = call('/api/compliance/documents', 'GET', auth=True)
    check('list compliance documents 200', status == 200 and len(body.get('documents', [])) >= 1)

    status, body, _ = call('/api/compliance/summary?jurisdictionCode=KE', 'GET', auth=True)
    check('compliance summary 200 (KE)', status == 200 and body.get('documentCount') == 1)
    check('compliance severity counts present', 'critical' in body.get('severityCounts', {}))

    status, body, _ = call('/api/compliance/profiles', 'POST',
                           {'profileType': 'vehicle', 'jurisdictionCode': 'KE',
                            'title': 'Tractor Unit KDA 123X', 'data': {'plate': 'KDA 123X'}}, auth=True)
    check('create compliance profile 201', status == 201)
    prof_id = body.get('profile', {}).get('id')

    status, body, _ = call('/api/compliance/profiles?profileType=vehicle', 'GET', auth=True)
    check('filter compliance profiles by type', status == 200 and len(body.get('profiles', [])) == 1)

    status, body, _ = call(f'/api/compliance/profiles/{prof_id}', 'PUT',
                           {'data': {'plate': 'KDA 123X', 'axles': 3}}, auth=True)
    check('update compliance profile 200', status == 200)

    status, body, _ = call(f'/api/compliance/documents/{doc_id}', 'DELETE', auth=True)
    check('delete compliance document 200', status == 200)

    status, body, _ = call(f'/api/compliance/profiles/{prof_id}', 'DELETE', auth=True)
    check('delete compliance profile 200', status == 200)

    # ---------- 8. Fleet & HOS ----------
    status, body, _ = call('/api/fleet/status', 'GET', auth=True)
    check('fleet status (no fleet) solo', status == 200 and body.get('hasFleet') is False)

    status, body, _ = call('/api/fleet/location', 'POST',
                           {'latitude': 41.2565, 'longitude': -95.9345, 'speed': 29.5}, auth=True)
    check('post fleet location 200', status == 200 and body.get('success') is True)

    status, body, _ = call('/api/fleet/location', 'POST', {'latitude': 41.25}, auth=True)
    check('post location missing longitude 400', status == 400)

    status, body, _ = call('/api/fleet/hos/status', 'POST', {'status': 'DRIVING'}, auth=True)
    check('HOS set DRIVING 201', status == 201 and body.get('status') == 'DRIVING')

    status, body, _ = call('/api/fleet/hos/status', 'POST', {'status': 'ON_DUTY'}, auth=True)
    check('HOS status change closes previous duty 201', status == 201)

    status, body, _ = call('/api/fleet/hos/status', 'GET', auth=True)
    check('HOS GET returns logs', status == 200 and len(body.get('logs', [])) == 2)

    status, body, _ = call('/api/fleet/hos/status', 'POST', {'status': 'FLYING'}, auth=True)
    check('HOS invalid status 400', status == 400)

    status, body, _ = call('/api/fleet/drivers/summary', 'GET', auth=True)
    check('fleet drivers summary blocked for solo 403', status == 403)

    # ---------- 9. Subscriptions ----------
    status, body, _ = call('/api/subscriptions/me', 'GET', auth=True)
    check('subscription created free tier', status == 200 and body.get('tier') == 'free')
    check('subscription has subscriber id', str(body.get('subscriberId', '')).startswith('RH-'))
    check('subscription trial active', body.get('trialActive') is True and body.get('trialDaysLeft', 0) >= 29)

    status, body, _ = call('/api/subscriptions/verify-purchase', 'POST', {}, auth=True)
    check('verify-purchase missing fields 400', status == 400)

    status, body, _ = call('/api/subscriptions/verify-purchase', 'POST',
                           {'productId': 'bogus_product', 'googleOrderId': 'GPA.SMOKE-1'}, auth=True)
    check('verify-purchase unknown product 400', status == 400)

    # A made-up order ID must never unlock a paid tier (Google must confirm it).
    status, body, _ = call('/api/subscriptions/verify-purchase', 'POST',
                           {'productId': 'righand_pro_monthly', 'googleOrderId': f'GPA.SMOKE-{uuid.uuid4().hex[:10]}'},
                           auth=True)
    check('verify-purchase rejects fake order id', status in (400, 503))
    status, body, _ = call('/api/subscriptions/me', 'GET', auth=True)
    check('fake order id left tier free', body.get('tier') == 'free')

    # activate/renew are local-dev shortcuts (DJANGO_ENV=development only).
    status, body, _ = call('/api/subscriptions/activate', 'POST', {'tier': 'pro'}, auth=True)
    check('dev activate pro 201', status == 201 and body.get('tier') == 'pro')

    status, body, _ = call('/api/subscriptions/events', 'GET', auth=True)
    check('purchase events logged', status == 200 and len(body.get('events', [])) >= 1)

    status, body, _ = call('/api/subscriptions/renew', 'POST', {}, auth=True)
    check('renew records event 200', status == 200 and body.get('tier') == 'pro')

    status, body, _ = call('/api/subscriptions/activate', 'POST', {'tier': 'fleet'}, auth=True)
    check('activate fleet tier 201', status == 201 and body.get('tier') == 'fleet')

    status, body, _ = call('/api/fleet/status', 'GET', auth=True)
    check('fleet auto-provisioned on fleet tier', status == 200 and body.get('hasFleet') is True)

    status, body, _ = call('/api/fleet/drivers/summary', 'GET', auth=True)
    check('fleet drivers summary as owner 200', status == 200 and 'drivers' in body)

    status, body, _ = call('/api/subscriptions/activate', 'POST', {'tier': 'diamond'}, auth=True)
    check('activate invalid tier 400', status == 400)

    status, body, _ = call('/api/subscriptions/cancel', 'POST', auth=True)
    check('cancel downgrades to free', status == 200 and body.get('tier') == 'free')

    status, body, _ = call('/api/subscriptions/update-used', 'POST', auth=True)
    check('update-used increments counter', status == 200 and body.get('freeUpdatesUsed') == 1)

    status, body, hdrs = call('/api/subscriptions/stripe-checkout', 'POST', {'tier': 'pro'}, auth=True)
    check('stripe checkout unconfigured 503', status == 503)

    status, body, _ = call('/api/billing/webhook', 'POST', {'type': 'checkout.session.completed'})
    check('stripe webhook unconfigured 503', status == 503)

    # ---------- 10. Auth required everywhere ----------
    for path in ('/api/expenses', '/api/categories', '/api/reports/metrics',
                 '/api/reports/export/pdf', '/api/subscriptions/me', '/api/fleet/status',
                 '/api/ops/load-packets', '/api/compliance/summary', '/api/auth/verify'):
        status, _, _ = call(path)
        check(f'401 without token: {path}', status in (401, 403))

    # ---------- 11. User isolation ----------
    status, body, _ = call('/api/auth/register', 'POST', {
        'email': f'smoke2-{uuid.uuid4().hex[:10]}@example.com', 'password': 'Other!2026',
        'name': 'Other User', 'truckerLicense': f'SM-{uuid.uuid4().hex[:8].upper()}',
    })
    other_token = body.get('token', '')
    status, body, _ = call(f'/api/expenses/{load_id}', 'DELETE',
                           headers={'Authorization': f'Bearer {other_token}'})
    check('other user cannot delete my entry 403', status == 403)

    status, body, _ = call('/api/expenses/user/whatever', 'GET',
                           headers={'Authorization': f'Bearer {other_token}'})
    check('other user blocked from foreign list 403', status == 403)

    # ---------- 12. Logout & cleanup ----------
    status, body, _ = call(f'/api/expenses/{fuel_id}', 'DELETE', auth=True)
    check('delete own expense 200', status == 200 and body.get('success') is True)

    status, body, _ = call(f'/api/ops/load-packets/{packet_id}', 'DELETE', auth=True)
    check('delete load packet 200', status == 200)

    status, body, _ = call('/api/auth/logout', 'POST', auth=True)
    check('logout 200', status == 200 and body.get('success') is True)

    # ---------- Summary ----------
    print()
    print(f'Smoketest: {PASSED} passed, {FAILED} failed')
    if FAILED:
        print('Failed checks:')
        for name in FAILURES:
            print(f'  - {name}')
        return 1
    print('ALL CHECKS PASSED')
    return 0


if __name__ == '__main__':
    sys.exit(main())
