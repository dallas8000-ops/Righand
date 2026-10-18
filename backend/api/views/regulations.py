import os

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import RegulationSource, RegulationUpdate, User, _iso_utc
from api.regulation_monitor import _aware, sync_sources, trigger_if_due
from api.utils import parse_json

REVIEW_STATUSES = ('approved', 'dismissed')


def _reviewer_emails():
    raw = os.environ.get('REGULATION_REVIEWER_EMAILS', '')
    return {email.strip().lower() for email in raw.split(',') if email.strip()}


def _user_email(user_id):
    user = User.objects.filter(pk=user_id).first()
    return (user.email or '').lower() if user else ''


def regulation_monitor_payload(jurisdiction_code=None, user_id=None):
    trigger_if_due()
    sync_sources()

    sources = RegulationSource.objects.all()
    updates = RegulationUpdate.objects.exclude(status='dismissed')
    if jurisdiction_code:
        code = jurisdiction_code.upper()[:10]
        sources = sources.filter(jurisdiction_code=code)
        updates = updates.filter(jurisdiction_code=code)

    checked = [_aware(s.last_checked_at) for s in sources if s.last_checked_at]
    return {
        'lastCheckedAt': _iso_utc(max(checked)) if checked else None,
        'sources': [s.to_dict() for s in sources.order_by('id')],
        'updates': [u.to_dict() for u in updates.order_by('-detected_at')[:20]],
        'pendingCount': updates.filter(status='pending_review').count(),
        'canReview': bool(user_id) and _user_email(user_id) in _reviewer_emails(),
    }


@jwt_required
@require_http_methods(['GET'])
def regulation_updates(request):
    jurisdiction_code = request.GET.get('jurisdictionCode') or request.GET.get('jurisdiction_code')
    return JsonResponse({
        'success': True,
        **regulation_monitor_payload(jurisdiction_code, request.righand_user_id),
    })


@jwt_required
@require_http_methods(['POST'])
def regulation_update_detail(request, update_id):
    email = _user_email(request.righand_user_id)
    if not email or email not in _reviewer_emails():
        return JsonResponse({'error': 'Not allowed to review regulation updates'}, status=403)

    update = RegulationUpdate.objects.filter(pk=update_id).first()
    if not update:
        return JsonResponse({'error': 'Update not found'}, status=404)

    status = (parse_json(request).get('status') or '').strip()
    if status not in REVIEW_STATUSES:
        return JsonResponse({'error': 'status must be approved or dismissed'}, status=400)

    update.status = status
    update.reviewed_at = timezone.now()
    update.reviewed_by = email
    update.save(update_fields=['status', 'reviewed_at', 'reviewed_by'])
    return JsonResponse({'success': True, 'update': update.to_dict()})
