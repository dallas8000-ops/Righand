"""Emit purchase/milestone events to dbops-api webhook."""

import os
from datetime import datetime, timezone

import requests


def emit_righand_event(event: str, data: dict) -> bool:
    """POST event to dbops-api. Returns True if delivered (or URL not configured)."""
    url = os.environ.get('DBOPS_WEBHOOK_URL', '').strip()
    if not url:
        return False

    payload = {
        'event': event,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'data': data,
    }
    headers = {'Content-Type': 'application/json'}
    secret = os.environ.get('DBOPS_WEBHOOK_SECRET', '')
    if secret:
        headers['X-Webhook-Secret'] = secret

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        print(f'[Webhook] Failed to emit {event}: {exc}')
        return False
