import uuid

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import DutyLog, Expense, FleetMembership, Tenant, User, VehicleLocation
from api.tier_guard import require_pro
from api.utils import parse_json


def _membership_for(user_id):
    return FleetMembership.objects.filter(user_id=user_id).first()


@jwt_required
@require_http_methods(['GET'])
def fleet_status(request):
    user_id = request.righand_user_id
    membership = _membership_for(user_id)

    if not membership:
        return JsonResponse({
            'success': True,
            'hasFleet': False,
            'tier': 'solo',
            'message': 'Fleet Lite ($89/mo) supports up to 5 drivers with dispatcher view.',
        })

    tenant = Tenant.objects.filter(pk=membership.tenant_id).first()
    members = FleetMembership.objects.filter(tenant_id=tenant.id)

    return JsonResponse({
        'success': True,
        'hasFleet': True,
        'tier': 'fleet_lite',
        'tenant': {
            'id': tenant.id,
            'name': tenant.name,
            'maxDrivers': tenant.max_drivers,
            'driverCount': members.count(),
        },
        'role': membership.role,
    })


@jwt_required
@require_http_methods(['GET'])
def driver_summaries(request):
    user_id = request.righand_user_id
    membership = _membership_for(user_id)

    if not membership or membership.role not in ('owner', 'dispatcher'):
        return JsonResponse({'error': 'Fleet dispatcher access required'}, status=403)

    tenant_id = membership.tenant_id
    driver_memberships = FleetMembership.objects.filter(tenant_id=tenant_id, role='driver')

    summaries = []
    for dm in driver_memberships:
        driver = User.objects.filter(pk=dm.user_id).first()
        if not driver:
            continue
        expenses = Expense.objects.filter(user_id=driver.id)
        income = sum(e.amount for e in expenses if e.expense_type == 'income')
        expense_total = sum(e.amount for e in expenses if e.expense_type == 'expense')
        location = VehicleLocation.objects.filter(user_id=driver.id).first()
        summaries.append({
            'driverId': driver.id,
            'name': driver.name,
            'email': driver.email,
            'totalIncome': round(income, 2),
            'totalExpenses': round(expense_total, 2),
            'netProfit': round(income - expense_total, 2),
            'lastLocation': {
                'lat': location.latitude,
                'lng': location.longitude,
                'recordedAt': location.recorded_at.isoformat(),
            } if location else None,
        })

    return JsonResponse({'success': True, 'drivers': summaries})


@jwt_required
@require_http_methods(['POST'])
def post_location(request):
    user_id = request.righand_user_id
    data = parse_json(request)

    lat = data.get('latitude')
    lng = data.get('longitude')
    if lat is None or lng is None:
        return JsonResponse({'error': 'latitude and longitude required'}, status=400)

    membership = _membership_for(user_id)
    tenant_id = membership.tenant_id if membership else None

    location = VehicleLocation.objects.filter(user_id=user_id).first()
    if not location:
        location = VehicleLocation(
            id=str(uuid.uuid4()),
            user_id=user_id,
            tenant_id=tenant_id,
            latitude=float(lat),
            longitude=float(lng),
            speed=float(data.get('speed', 0)),
            heading=data.get('heading'),
            recorded_at=timezone.now(),
        )
        location.save()
    else:
        location.latitude = float(lat)
        location.longitude = float(lng)
        location.speed = float(data.get('speed', 0))
        location.heading = data.get('heading')
        location.recorded_at = timezone.now()
        if tenant_id:
            location.tenant_id = tenant_id
        location.save()

    return JsonResponse({'success': True})


@jwt_required
@require_pro
def hos_status(request):
    user_id = request.righand_user_id

    if request.method == 'GET':
        logs = DutyLog.objects.filter(user_id=user_id).order_by('-started_at')[:20]
        current = next((log for log in logs if log.ended_at is None), None)
        return JsonResponse({
            'success': True,
            'currentStatus': current.status if current else 'OFF_DUTY',
            'currentStartedAt': current.started_at.isoformat() if current else None,
            'logs': [{
                'id': log.id,
                'status': log.status,
                'startedAt': log.started_at.isoformat(),
                'endedAt': log.ended_at.isoformat() if log.ended_at else None,
            } for log in logs],
        })

    data = parse_json(request)
    status = data.get('status')
    allowed = {'OFF_DUTY', 'SLEEPER', 'DRIVING', 'ON_DUTY'}
    if status not in allowed:
        return JsonResponse({'error': f'status must be one of {sorted(allowed)}'}, status=400)

    open_log = DutyLog.objects.filter(user_id=user_id, ended_at__isnull=True).first()
    if open_log:
        open_log.ended_at = timezone.now()
        open_log.save()

    DutyLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        status=status,
        started_at=timezone.now(),
        notes=data.get('notes'),
    ).save()

    return JsonResponse({'success': True, 'status': status}, status=201)
