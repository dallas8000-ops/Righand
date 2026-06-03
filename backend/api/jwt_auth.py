"""JWT helpers compatible with existing Flask-JWT-Extended tokens."""

import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from django.conf import settings
from django.http import JsonResponse


def create_access_token(identity: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + settings.JWT_ACCESS_TOKEN_EXPIRES
    payload = {
        'fresh': False,
        'iat': int(now.timestamp()),
        'jti': str(uuid.uuid4()),
        'type': 'access',
        'sub': identity,
        'nbf': int(now.timestamp()),
        'exp': int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm='HS256')


def get_request_user_id(request) -> str | None:
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth.startswith('Bearer '):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        data = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=['HS256'])
        return data.get('sub')
    except jwt.PyJWTError:
        return None


def jwt_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        user_id = get_request_user_id(request)
        if not user_id:
            return JsonResponse({'error': 'Missing or invalid authorization token'}, status=401)
        request.righand_user_id = user_id
        return view_func(request, *args, **kwargs)

    return wrapper
