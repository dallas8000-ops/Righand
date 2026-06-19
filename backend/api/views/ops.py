import uuid
from datetime import datetime

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import LoadPacket, MaintenanceItem
from api.utils import parse_json


def _date(value):
    if not value:
        return None
    return datetime.fromisoformat(str(value)[:10]).date()


def _float(value):
    return float(value) if value not in (None, '') else None


def _apply_load_fields(packet, data):
    packet.status = data.get('status', packet.status or 'planned')
    packet.load_number = data.get('loadNumber') or data.get('load_number') or None
    packet.broker = data.get('broker') or None
    packet.shipper = data.get('shipper') or None
    packet.receiver = data.get('receiver') or None
    packet.pickup_date = _date(data.get('pickupDate') or data.get('pickup_date'))
    packet.delivery_date = _date(data.get('deliveryDate') or data.get('delivery_date'))
    packet.rate = _float(data.get('rate'))
    packet.loaded_miles = _float(data.get('loadedMiles') or data.get('loaded_miles'))
    packet.deadhead_miles = _float(data.get('deadheadMiles') or data.get('deadhead_miles'))
    packet.fuel_estimate = _float(data.get('fuelEstimate') or data.get('fuel_estimate'))
    packet.tolls = _float(data.get('tolls'))
    packet.detention_terms = data.get('detentionTerms') or data.get('detention_terms') or None
    packet.lumper = _float(data.get('lumper'))
    packet.pickup_address = data.get('pickupAddress') or data.get('pickup_address') or None
    packet.delivery_address = data.get('deliveryAddress') or data.get('delivery_address') or None
    packet.notes = data.get('notes') or None
    packet.contract_url = data.get('contractUrl') or data.get('contract_url') or None
    packet.bol_url = data.get('bolUrl') or data.get('bol_url') or None
    packet.pod_url = data.get('podUrl') or data.get('pod_url') or None


def _apply_maintenance_fields(item, data):
    item.name = data.get('name') or item.name
    item.due_odometer = _float(data.get('dueOdometer') or data.get('due_odometer'))
    item.due_date = _date(data.get('dueDate') or data.get('due_date'))
    item.last_completed_odometer = _float(
        data.get('lastCompletedOdometer') or data.get('last_completed_odometer')
    )
    item.notes = data.get('notes') or None


@jwt_required
@require_http_methods(['GET', 'POST'])
def load_packets(request):
    user_id = request.righand_user_id

    if request.method == 'GET':
        packets = LoadPacket.objects.filter(user_id=user_id).order_by('-updated_at')
        return JsonResponse({'success': True, 'loadPackets': [p.to_dict() for p in packets]})

    data = parse_json(request)
    packet = LoadPacket(id=data.get('id') or str(uuid.uuid4()), user_id=user_id)
    _apply_load_fields(packet, data)
    packet.save()
    return JsonResponse({'success': True, 'loadPacket': packet.to_dict()}, status=201)


@jwt_required
def load_packet_detail(request, packet_id):
    user_id = request.righand_user_id
    packet = LoadPacket.objects.filter(pk=packet_id, user_id=user_id).first()
    if not packet:
        return JsonResponse({'error': 'Load packet not found'}, status=404)

    if request.method == 'PUT':
        _apply_load_fields(packet, parse_json(request))
        packet.save()
        return JsonResponse({'success': True, 'loadPacket': packet.to_dict()})

    if request.method == 'DELETE':
        packet.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@jwt_required
@require_http_methods(['GET', 'POST'])
def maintenance_items(request):
    user_id = request.righand_user_id

    if request.method == 'GET':
        items = MaintenanceItem.objects.filter(user_id=user_id).order_by('-updated_at')
        return JsonResponse({'success': True, 'maintenanceItems': [i.to_dict() for i in items]})

    data = parse_json(request)
    item = MaintenanceItem(id=data.get('id') or str(uuid.uuid4()), user_id=user_id, name=data.get('name') or 'Service')
    _apply_maintenance_fields(item, data)
    item.save()
    return JsonResponse({'success': True, 'maintenanceItem': item.to_dict()}, status=201)


@jwt_required
def maintenance_item_detail(request, item_id):
    user_id = request.righand_user_id
    item = MaintenanceItem.objects.filter(pk=item_id, user_id=user_id).first()
    if not item:
        return JsonResponse({'error': 'Maintenance item not found'}, status=404)

    if request.method == 'PUT':
        _apply_maintenance_fields(item, parse_json(request))
        item.save()
        return JsonResponse({'success': True, 'maintenanceItem': item.to_dict()})

    if request.method == 'DELETE':
        item.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)
