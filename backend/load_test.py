"""Load test for the RigHand API (asyncio + httpx, no extra dependencies).

Simulates drivers who log in, then loop over a realistic mix of API calls
(check expenses, log an expense, view reports/loads/fleet, ping health).

Examples:
  python load_test.py                                  # local server on :8000, 3 stages
  python load_test.py --stages 10:20,50:30,100:30      # users:seconds per stage
  python load_test.py --base-url https://host --allow-remote

Run against a local/staging server, not production: it registers test users
and writes expense rows.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import statistics
import sys
import time
import uuid
from collections import defaultdict
from urllib.parse import urlparse

import httpx

LOCAL_HOSTS = {'127.0.0.1', 'localhost', '::1'}


class Stats:
    def __init__(self):
        self.latencies = defaultdict(list)
        self.errors = defaultdict(int)
        self.error_samples = {}
        self.statuses = defaultdict(lambda: defaultdict(int))

    def record(self, name, status, elapsed, ok, detail=''):
        self.latencies[name].append(elapsed)
        self.statuses[name][status] += 1
        if not ok:
            self.errors[name] += 1
            self.error_samples.setdefault((name, status), detail[:160])

    def merge_total(self):
        return [x for v in self.latencies.values() for x in v]


def pct(values, p):
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p / 100))]


async def timed(client, stats, name, method, url, expect=(200, 201), **kwargs):
    start = time.perf_counter()
    status = 0
    detail = ''
    try:
        response = await client.request(method, url, **kwargs)
        status = response.status_code
        if status not in expect:
            detail = response.text
        ok = status in expect
    except httpx.HTTPError as exc:
        ok = False
        detail = f'{type(exc).__name__}: {exc}'
    stats.record(name, status, time.perf_counter() - start, ok, detail)
    return response if status else None


async def register_user(client, tag):
    payload = {
        'email': f'load_{tag}@example.com',
        'password': 'LoadTest!12345',
        'name': f'Load {tag}',
        'truckerLicense': f'LT{tag}',
    }
    response = await client.post('/api/auth/register', json=payload)
    if response.status_code not in (200, 201):
        raise RuntimeError(f'register failed: {response.status_code} {response.text[:200]}')
    data = response.json()
    return payload, data['token'], data['user']['id']


async def driver(client, creds, stats, stop_at, think_time):
    payload, token, user_id = creds
    auth = {'Authorization': f'Bearer {token}'}
    actions = [
        (30, lambda: timed(client, stats, 'GET expenses', 'GET', f'/api/expenses/user/{user_id}', headers=auth)),
        (15, lambda: timed(client, stats, 'POST expense', 'POST', '/api/expenses', headers=auth, json={
            'description': 'load test fuel', 'amount': round(random.uniform(20, 400), 2),
            'category': 'fuel', 'type': 'expense', 'miles': 120, 'gallons': 18,
        })),
        (15, lambda: timed(client, stats, 'GET metrics', 'GET', '/api/reports/metrics', headers=auth)),
        (10, lambda: timed(client, stats, 'GET categories', 'GET', '/api/categories', headers=auth)),
        (10, lambda: timed(client, stats, 'GET load-packets', 'GET', '/api/ops/load-packets', headers=auth)),
        (8, lambda: timed(client, stats, 'GET fleet status', 'GET', '/api/fleet/status', headers=auth)),
        (5, lambda: timed(client, stats, 'GET verify', 'GET', '/api/auth/verify', headers=auth)),
        (5, lambda: timed(client, stats, 'GET health', 'GET', '/health')),
        (2, lambda: timed(client, stats, 'POST login', 'POST', '/api/auth/login', json={
            'email': payload['email'], 'password': payload['password'],
        })),
    ]
    weights = [w for w, _ in actions]
    calls = [c for _, c in actions]
    # Stagger starts so users don't fire in lockstep.
    await asyncio.sleep(random.uniform(0, think_time))
    while time.monotonic() < stop_at:
        await random.choices(calls, weights)[0]()
        await asyncio.sleep(random.uniform(0.5, 1.5) * think_time)


async def run_stage(base_url, pool, users, seconds, think_time):
    stats = Stats()
    stop_at = time.monotonic() + seconds
    started = time.perf_counter()
    # One shared client: building a client per simulated user stalls the event loop on SSL setup.
    limits = httpx.Limits(max_connections=users + 10, max_keepalive_connections=users + 10)
    async with httpx.AsyncClient(base_url=base_url, timeout=30, limits=limits) as client:
        await asyncio.gather(*(
            driver(client, pool[i % len(pool)], stats, stop_at, think_time) for i in range(users)
        ))
    return stats, time.perf_counter() - started


def report(users, stats, duration, max_error_rate, max_p95):
    total = len(stats.merge_total())
    errors = sum(stats.errors.values())
    error_rate = errors / total * 100 if total else 100.0
    all_lat = stats.merge_total()
    p95 = pct(all_lat, 95) * 1000
    print(f'\n=== {users} concurrent users, {duration:.0f}s ===')
    print(f'{"endpoint":<18}{"reqs":>7}{"err":>6}{"p50ms":>8}{"p95ms":>8}{"p99ms":>8}{"maxms":>8}')
    for name in sorted(stats.latencies):
        lat = stats.latencies[name]
        print(f'{name:<18}{len(lat):>7}{stats.errors[name]:>6}'
              f'{pct(lat, 50) * 1000:>8.0f}{pct(lat, 95) * 1000:>8.0f}'
              f'{pct(lat, 99) * 1000:>8.0f}{max(lat) * 1000:>8.0f}')
    mean = statistics.mean(all_lat) * 1000 if all_lat else 0
    print(f'TOTAL {total} reqs, {total / duration:.1f} req/s, mean {mean:.0f}ms, '
          f'p95 {p95:.0f}ms, errors {errors} ({error_rate:.2f}%)')
    for (name, status), detail in stats.error_samples.items():
        print(f'  ! {name} -> {status}: {detail}')
    passed = error_rate <= max_error_rate and p95 <= max_p95
    print('RESULT:', 'PASS' if passed else 'FAIL')
    return passed


async def main_async(args):
    parsed = urlparse(args.base_url)
    if parsed.hostname not in LOCAL_HOSTS and not args.allow_remote:
        print('Refusing to load-test a non-local host without --allow-remote.', file=sys.stderr)
        return 2

    stages = [tuple(int(x) for x in s.split(':')) for s in args.stages.split(',')]
    max_users = max(u for u, _ in stages)
    pool_size = min(max_users, args.accounts)

    async with httpx.AsyncClient(base_url=args.base_url, timeout=60) as client:
        health = await client.get('/health')
        print(f'Target {args.base_url} /health -> {health.status_code}')
        run_id = uuid.uuid4().hex[:8]
        print(f'Registering {pool_size} test accounts...')
        sem = asyncio.Semaphore(4)

        async def reg(i):
            async with sem:
                return await register_user(client, f'{run_id}{i}')

        pool = await asyncio.gather(*(reg(i) for i in range(pool_size)))

    results = []
    for users, seconds in stages:
        stats, duration = await run_stage(args.base_url, pool, users, seconds, args.think_time)
        results.append(report(users, stats, duration, args.max_error_rate, args.max_p95_ms))

    async with httpx.AsyncClient(base_url=args.base_url, timeout=30) as client:
        after = await client.get('/health')
    print(f'\nPost-test /health -> {after.status_code}')
    ok = all(results) and after.status_code == 200
    print('OVERALL:', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--stages', default='10:20,50:30,100:30', help='users:seconds,...')
    parser.add_argument('--accounts', type=int, default=20, help='test accounts shared across users')
    parser.add_argument('--think-time', type=float, default=1.0, help='avg seconds between actions per user')
    parser.add_argument('--max-error-rate', type=float, default=1.0, help='percent')
    parser.add_argument('--max-p95-ms', type=float, default=1500)
    parser.add_argument('--allow-remote', action='store_true')
    args = parser.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == '__main__':
    main()
