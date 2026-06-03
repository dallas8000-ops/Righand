import uuid

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from werkzeug.security import check_password_hash, generate_password_hash

from api.jwt_auth import create_access_token, jwt_required
from api.models import User
from api.utils import parse_json


@require_http_methods(['POST'])
def register(request):
    try:
        data = parse_json(request)
        if not all(k in data for k in ['email', 'password', 'name', 'truckerLicense']):
            return JsonResponse({'error': 'Missing required fields'}, status=400)

        if User.objects.filter(email=data['email']).exists():
            return JsonResponse({'error': 'Email already registered'}, status=409)

        if User.objects.filter(trucker_license=data['truckerLicense']).exists():
            return JsonResponse({'error': 'Trucker license already registered'}, status=409)

        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            email=data['email'],
            password_hash=generate_password_hash(data['password']),
            name=data['name'],
            trucker_license=data['truckerLicense'],
        )
        user.save()

        access_token = create_access_token(user.id)
        return JsonResponse({
            'success': True,
            'token': access_token,
            'user': user.to_dict(),
        }, status=201)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@require_http_methods(['POST'])
def login(request):
    try:
        data = parse_json(request)
        if not data.get('email') or not data.get('password'):
            return JsonResponse({'error': 'Missing email or password'}, status=400)

        user = User.objects.filter(email=data['email']).first()
        if not user or not check_password_hash(user.password_hash, data['password']):
            return JsonResponse({'error': 'Invalid credentials'}, status=401)

        access_token = create_access_token(user.id)
        return JsonResponse({
            'success': True,
            'token': access_token,
            'user': user.to_dict(),
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_http_methods(['GET'])
def verify(request):
    try:
        user = User.objects.filter(pk=request.righand_user_id).first()
        if not user:
            return JsonResponse({'error': 'User not found'}, status=404)
        return JsonResponse({'success': True, 'user': user.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_http_methods(['POST'])
def logout(request):
    return JsonResponse({'success': True, 'message': 'Logged out successfully'})
