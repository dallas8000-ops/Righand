import re
import uuid

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import UserCategory
from api.tier_guard import require_pro
from api.utils import parse_json


def _slugify(value):
    slug = value.strip().lower()
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    return slug


@jwt_required
def categories(request):
    if request.method == 'GET':
        return list_categories(request)
    if request.method == 'POST':
        return create_category(request)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


def list_categories(request):
    user_id = request.righand_user_id
    categories = UserCategory.objects.filter(user_id=user_id).order_by('label')
    return JsonResponse({
        'success': True,
        'categories': [c.to_dict() for c in categories],
    })


@jwt_required
@require_pro
@require_http_methods(['POST'])
def create_category(request):
    user_id = request.righand_user_id
    data = parse_json(request)
    label = (data.get('label') or '').strip()
    if not label:
        return JsonResponse({'error': 'label is required'}, status=400)

    value = _slugify(data.get('value') or label)
    if not value:
        return JsonResponse({'error': 'invalid category name'}, status=400)

    existing = UserCategory.objects.filter(user_id=user_id, value=value).first()
    if existing:
        return JsonResponse({'success': True, 'category': existing.to_dict()})

    entry_type = data.get('entryType', 'expense')
    if entry_type not in ('expense', 'income', 'both'):
        entry_type = 'expense'

    category = UserCategory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        value=value,
        label=label,
        entry_type=entry_type,
    )
    category.save()
    return JsonResponse({'success': True, 'category': category.to_dict()}, status=201)


@jwt_required
@require_pro
@require_http_methods(['DELETE'])
def delete_category(request, category_id):
    user_id = request.righand_user_id
    category = UserCategory.objects.filter(pk=category_id).first()
    if not category or category.user_id != user_id:
        return JsonResponse({'error': 'Category not found'}, status=404)
    category.delete()
    return JsonResponse({'success': True})
