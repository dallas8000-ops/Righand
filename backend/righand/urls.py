from django.contrib import admin
from django.urls import include, path, re_path

from . import views

urlpatterns = [
    path('health', views.health, name='health'),
    path('health/billing', views.billing_health, name='billing-health'),
    path('api/', include('api.urls')),
    path('admin/', admin.site.urls),
    # React SPA — must be last (all non-API routes)
    re_path(r'^.*$', views.spa_index, name='spa'),
]
