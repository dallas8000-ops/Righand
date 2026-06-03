from django.conf import settings
from django.http import FileResponse, JsonResponse


def health(request):
    return JsonResponse({
        'status': 'healthy',
        'service': 'RigHand AI Backend',
        'version': '1.0.0',
    })


def spa_index(request):
    """Serve the React production build (Django hosts the full web app)."""
    index_path = settings.FRONTEND_BUILD_DIR / 'index.html'
    if index_path.is_file():
        return FileResponse(index_path.open('rb'), content_type='text/html')
    return JsonResponse({
        'service': 'Righand API',
        'status': 'online',
        'message': 'Frontend build not found. Run: cd frontend && npm run build',
        'api': '/api/',
    })
