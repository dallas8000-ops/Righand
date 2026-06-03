"""
WSGI entry for Gunicorn.

Deploy with:
  gunicorn righand.wsgi:application
  # or legacy:
  gunicorn app:app
"""

from righand.wsgi import application as app

__all__ = ['app', 'application']

application = app
