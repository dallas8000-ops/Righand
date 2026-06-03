from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        from api.schema_migrations import run_migrations

        try:
            run_migrations()
        except Exception:
            pass
