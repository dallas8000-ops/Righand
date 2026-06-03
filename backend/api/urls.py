from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from api import views

csrf = csrf_exempt

urlpatterns = [
    path('auth/register', csrf(views.register)),
    path('auth/login', csrf(views.login)),
    path('auth/verify', csrf(views.verify)),
    path('auth/logout', csrf(views.logout)),
    path('expenses/profit', csrf(views.calculate_profit)),
    path('expenses/user/<str:user_id>', csrf(views.get_user_expenses)),
    path('expenses/<str:expense_id>', csrf(views.expense_detail)),
    path('expenses', csrf(views.create_expense)),
    path('categories/<str:category_id>', csrf(views.delete_category)),
    path('categories', csrf(views.categories)),
    path('reports/metrics', csrf(views.get_metrics)),
    path('reports/weekly-summary', csrf(views.weekly_summary)),
    path('reports/export/csv', csrf(views.export_csv)),
    path('reports/export/pdf', csrf(views.export_pdf)),
    path('reports/tax/quarterly', csrf(views.tax_quarterly)),
    path('reports/ifta', csrf(views.ifta_report)),
    path('fleet/status', csrf(views.fleet_status)),
    path('fleet/drivers/summary', csrf(views.driver_summaries)),
    path('fleet/location', csrf(views.post_location)),
    path('fleet/hos/status', csrf(views.hos_status)),
    path('subscriptions/me', csrf(views.my_subscription)),
    path('subscriptions/events', csrf(views.my_purchase_events)),
    path('subscriptions/verify-purchase', csrf(views.verify_purchase)),
    path('subscriptions/activate', csrf(views.activate_subscription)),
    path('subscriptions/renew', csrf(views.renew_subscription)),
    path('subscriptions/cancel', csrf(views.cancel_subscription)),
    path('subscriptions/update-used', csrf(views.record_free_update)),
]
