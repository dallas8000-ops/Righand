"""
Receives purchase/milestone events from RigHand AI and stores them for a personal dashboard.

Endpoint: POST /api/webhooks/righand
Header: X-Webhook-Secret: <shared secret>

Register in your Flask app:
    from righand_webhook import righand_webhook_bp
    app.register_blueprint(righand_webhook_bp)
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import os
import json

righand_webhook_bp = Blueprint('righand_webhook', __name__)

WEBHOOK_SECRET = os.environ.get('DBOPS_WEBHOOK_SECRET', '')


@righand_webhook_bp.route('/api/webhooks/righand', methods=['POST'])
def receive_righand_event():
    """Receives purchase/milestone events from RigHand AI."""
    if WEBHOOK_SECRET:
        incoming = request.headers.get('X-Webhook-Secret', '')
        if incoming != WEBHOOK_SECRET:
            return jsonify({'error': 'unauthorized'}), 401

    payload = request.get_json() or {}
    event = payload.get('event', 'unknown')
    data = payload.get('data', {})
    timestamp = payload.get('timestamp', datetime.now(timezone.utc).isoformat())

    log_entry = {
        'received_at': datetime.now(timezone.utc).isoformat(),
        'source': 'righand_ai',
        'event': event,
        'timestamp': timestamp,
        'data': data,
    }

    log_path = os.environ.get('RIGHAND_LOG_PATH', 'righand_events.jsonl')
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(log_entry) + '\n')

    print(f'[RigHand Event] {event} — {data.get("subscriber_id", "?")} at {timestamp}')

    if event == 'milestone_3mo':
        _send_owner_notification(data)

    return jsonify({'ok': True, 'event': event}), 200


def _send_owner_notification(data: dict):
    """Placeholder — swap for email, Slack, SMS, etc."""
    subscriber_id = data.get('subscriber_id', '?')
    price = data.get('current_price', 0)
    started = data.get('pro_started_at', '?')
    print(
        f'MILESTONE: {subscriber_id} has been Pro for 3 months '
        f'(started {started}, paying ${price}/mo)'
    )


@righand_webhook_bp.route('/api/webhooks/righand/events', methods=['GET'])
def list_events():
    """Returns logged RigHand events for the personal dashboard."""
    secret = request.headers.get('X-Admin-Secret', '')
    if secret != os.environ.get('ADMIN_SECRET', ''):
        return jsonify({'error': 'unauthorized'}), 401

    log_path = os.environ.get('RIGHAND_LOG_PATH', 'righand_events.jsonl')
    events = []
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))
    except FileNotFoundError:
        pass

    events.reverse()
    return jsonify({
        'total': len(events),
        'events': events[:200],
    })


@righand_webhook_bp.route('/api/webhooks/righand/summary', methods=['GET'])
def events_summary():
    """Aggregated stats for the dashboard."""
    secret = request.headers.get('X-Admin-Secret', '')
    if secret != os.environ.get('ADMIN_SECRET', ''):
        return jsonify({'error': 'unauthorized'}), 401

    log_path = os.environ.get('RIGHAND_LOG_PATH', 'righand_events.jsonl')
    events = []
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))
    except FileNotFoundError:
        pass

    purchase_events = {'purchase_pro', 'purchase_fleet', 'renewal_pro', 'renewal_fleet'}
    purchases = [e for e in events if e.get('event') in purchase_events]
    milestones = [e for e in events if e.get('event') == 'milestone_3mo']
    cancels = [e for e in events if e.get('event') in ('cancel_pro', 'cancel_fleet')]

    mrr = 0
    active = {}
    for e in reversed(events):
        ev = e.get('event', '')
        sid = e.get('data', {}).get('subscriber_id')
        price = e.get('data', {}).get('current_price', 0) or 0
        if not sid:
            continue
        if ev in purchase_events and sid not in active:
            active[sid] = price
        elif ev in ('cancel_pro', 'cancel_fleet'):
            active.pop(sid, None)

    mrr = sum(active.values())

    return jsonify({
        'total_events': len(events),
        'total_purchases': len(purchases),
        'milestones_3mo': len(milestones),
        'cancellations': len(cancels),
        'estimated_mrr': round(mrr, 2),
        'active_subscribers': len(active),
    })
