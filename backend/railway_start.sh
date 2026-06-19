#!/bin/sh
set -u

echo "RigHand Railway start: preparing database"
if ! python3 manage.py migrate --noinput; then
  echo "ERROR: Django migrate failed."
  if [ -n "${RAILWAY_ENVIRONMENT:-}" ]; then
    exit 1
  fi
  echo "WARNING: continuing in non-Railway environment for local debug."
fi

echo "RigHand Railway start: launching web server on port ${PORT:-8000}"
exec gunicorn --bind "0.0.0.0:${PORT:-8000}" righand.wsgi:application
