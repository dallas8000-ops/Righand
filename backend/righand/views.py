from django.http import JsonResponse


def home(request):
    return JsonResponse({
        'status': 'running',
        'service': 'RigHand AI Backend',
        'framework': 'Django',
        'version': '1.0.0',
        'health': '/health',
        'api': '/api',
    })


def health(request):
    return JsonResponse({
        'status': 'healthy',
        'service': 'RigHand AI Backend',
        'version': '1.0.0',
    })
