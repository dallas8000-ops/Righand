from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Tenant, FleetMembership, User, Expense, VehicleLocation, DutyLog
from datetime import datetime
import uuid

fleet_bp = Blueprint('fleet', __name__, url_prefix='/api/fleet')


def _membership_for(user_id):
    return FleetMembership.query.filter_by(user_id=user_id).first()


@fleet_bp.route('/status', methods=['GET'])
@jwt_required()
def fleet_status():
    """Fleet tier status for current user."""
    user_id = get_jwt_identity()
    membership = _membership_for(user_id)

    if not membership:
        return jsonify({
            'success': True,
            'hasFleet': False,
            'tier': 'solo',
            'message': 'Fleet Lite ($99/mo) supports up to 5 drivers with dispatcher view.'
        }), 200

    tenant = Tenant.query.get(membership.tenant_id)
    members = FleetMembership.query.filter_by(tenant_id=tenant.id).all()

    return jsonify({
        'success': True,
        'hasFleet': True,
        'tier': 'fleet_lite',
        'tenant': {
            'id': tenant.id,
            'name': tenant.name,
            'maxDrivers': tenant.max_drivers,
            'driverCount': len(members)
        },
        'role': membership.role
    }), 200


@fleet_bp.route('/drivers/summary', methods=['GET'])
@jwt_required()
def driver_summaries():
    """Read-only dispatcher P&L across fleet drivers (Tier B)."""
    user_id = get_jwt_identity()
    membership = _membership_for(user_id)

    if not membership or membership.role not in ('owner', 'dispatcher'):
        return jsonify({'error': 'Fleet dispatcher access required'}), 403

    tenant_id = membership.tenant_id
    driver_memberships = FleetMembership.query.filter_by(
        tenant_id=tenant_id,
        role='driver'
    ).all()

    summaries = []
    for dm in driver_memberships:
        driver = User.query.get(dm.user_id)
        if not driver:
            continue
        expenses = Expense.query.filter_by(user_id=driver.id).all()
        income = sum(e.amount for e in expenses if e.expense_type == 'income')
        expense_total = sum(e.amount for e in expenses if e.expense_type == 'expense')
        location = VehicleLocation.query.filter_by(user_id=driver.id).first()
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
                'recordedAt': location.recorded_at.isoformat()
            } if location else None
        })

    return jsonify({'success': True, 'drivers': summaries}), 200


@fleet_bp.route('/location', methods=['POST'])
@jwt_required()
def post_location():
    """GPS ping from driver app (Tier B live map foundation)."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    lat = data.get('latitude')
    lng = data.get('longitude')
    if lat is None or lng is None:
        return jsonify({'error': 'latitude and longitude required'}), 400

    membership = _membership_for(user_id)
    tenant_id = membership.tenant_id if membership else None

    location = VehicleLocation.query.filter_by(user_id=user_id).first()
    if not location:
        location = VehicleLocation(
            id=str(uuid.uuid4()),
            user_id=user_id,
            tenant_id=tenant_id,
            latitude=float(lat),
            longitude=float(lng),
            speed=float(data.get('speed', 0)),
            heading=data.get('heading'),
            recorded_at=datetime.utcnow()
        )
        db.session.add(location)
    else:
        location.latitude = float(lat)
        location.longitude = float(lng)
        location.speed = float(data.get('speed', 0))
        location.heading = data.get('heading')
        location.recorded_at = datetime.utcnow()
        if tenant_id:
            location.tenant_id = tenant_id

    db.session.commit()
    return jsonify({'success': True}), 200


@fleet_bp.route('/hos/status', methods=['GET', 'POST'])
@jwt_required()
def hos_status():
    """HOS lite — manual duty status log (not certified ELD)."""
    user_id = get_jwt_identity()

    if request.method == 'GET':
        logs = DutyLog.query.filter_by(user_id=user_id).order_by(
            DutyLog.started_at.desc()
        ).limit(20).all()
        current = next((log for log in logs if log.ended_at is None), None)
        return jsonify({
            'success': True,
            'currentStatus': current.status if current else 'OFF_DUTY',
            'currentStartedAt': current.started_at.isoformat() if current else None,
            'logs': [{
                'id': log.id,
                'status': log.status,
                'startedAt': log.started_at.isoformat(),
                'endedAt': log.ended_at.isoformat() if log.ended_at else None
            } for log in logs]
        }), 200

    data = request.get_json() or {}
    status = data.get('status')
    allowed = {'OFF_DUTY', 'SLEEPER', 'DRIVING', 'ON_DUTY'}
    if status not in allowed:
        return jsonify({'error': f'status must be one of {sorted(allowed)}'}), 400

    open_log = DutyLog.query.filter_by(user_id=user_id, ended_at=None).first()
    if open_log:
        open_log.ended_at = datetime.utcnow()

    new_log = DutyLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        status=status,
        started_at=datetime.utcnow(),
        notes=data.get('notes')
    )
    db.session.add(new_log)
    db.session.commit()

    return jsonify({'success': True, 'status': status}), 201
