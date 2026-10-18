import uuid

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from werkzeug.security import generate_password_hash

from api.jwt_auth import jwt_required
from api.models import DutyLog, Expense, FleetMembership, Tenant, User, VehicleLocation
from api.tier_guard import require_pro
from api.utils import parse_json
from fleet_service import FLEET_SEAT_ROLES, add_fleet_member

MIN_PASSWORD_LENGTH = 6


def _membership_for(user_id):
    return FleetMembership.objects.filter(user_id=user_id).first()


def _owner_tenant(user_id):
    membership = _membership_for(user_id)
    if not membership or membership.role != 'owner':
        return None
    return Tenant.objects.filter(pk=membership.tenant_id).first()


@jwt_required
@require_http_methods(['POST'])
def add_fleet_driver(request):
    tenant = _owner_tenant(request.righand_user_id)
    if not tenant:
        return JsonResponse({'error': 'Only the fleet owner can add drivers'}, status=403)

    data = parse_json(request)
    email = (data.get('email') or '').strip().lower()
    role = (data.get('role') or 'driver').strip()
    if not email:
        return JsonResponse({'error': 'Email is required'}, status=400)
    if role not in FLEET_SEAT_ROLES:
        return JsonResponse({'error': 'Role must be driver or dispatcher'}, status=400)

    member = User.objects.filter(email__iexact=email).first()
    created = False
    if not member:
        name = (data.get('name') or '').strip()
        license_number = (data.get('truckerLicense') or '').strip()
        password = data.get('password') or ''
        if not name or not license_number or len(password) < MIN_PASSWORD_LENGTH:
            return JsonResponse({
                'error': f'No account exists for {email}. Provide name, truckerLicense, and a temporary password of at least {MIN_PASSWORD_LENGTH} characters to create one.',
                'code': 'ACCOUNT_DETAILS_REQUIRED',
            }, status=400)
        if User.objects.filter(trucker_license=license_number).exists():
            return JsonResponse({'error': 'Driving licence number already registered'}, status=409)
        member = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=generate_password_hash(password),
            name=name,
            trucker_license=license_number,
        )
        created = True

    try:
        with transaction.atomic():
            if created:
                member.save()
            add_fleet_member(tenant, member, role)
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=409)
    except IntegrityError:
        return JsonResponse({'error': 'Could not create the driver account (email or licence number already used)'}, status=409)

    return JsonResponse({
        'success': True,
        'created': created,
        'member': {'id': member.id, 'name': member.name, 'email': member.email, 'role': role},
    }, status=201)


@jwt_required
@require_http_methods(['DELETE'])
def remove_fleet_driver(request, member_user_id):
    tenant = _owner_tenant(request.righand_user_id)
    if not tenant:
        return JsonResponse({'error': 'Only the fleet owner can remove drivers'}, status=403)

    membership = FleetMembership.objects.filter(tenant_id=tenant.id, user_id=member_user_id).first()
    if not membership:
        return JsonResponse({'error': 'Member not found in your fleet'}, status=404)
    if membership.role == 'owner':
        return JsonResponse({'error': 'The fleet owner cannot be removed'}, status=400)

    membership.delete()
    return JsonResponse({'success': True})


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
            'message': 'Fleet Lite ($89/mo) includes 1 billing owner plus up to 5 driver/dispatcher seats.',
        })

    tenant = Tenant.objects.filter(pk=membership.tenant_id).first()
    members = FleetMembership.objects.filter(tenant_id=tenant.id)
    seat_count = members.filter(role__in=FLEET_SEAT_ROLES).count()
    driver_count = members.filter(role='driver').count()

    return JsonResponse({
        'success': True,
        'hasFleet': True,
        'tier': 'fleet_lite',
        'tenant': {
            'id': tenant.id,
            'name': tenant.name,
            'maxDrivers': tenant.max_drivers,
            'driverCount': driver_count,
            'seatCount': seat_count,
            'remainingSeats': max(tenant.max_drivers - seat_count, 0),
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
