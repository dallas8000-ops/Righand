#!/bin/sh
set -u

echo "RigHand Railway start: preparing database"
python3 -c "import os,sys,urllib.parse as u; url=os.environ.get('DATABASE_URL',''); \
host=u.urlparse(url.replace('postgres://','postgresql://',1)).hostname or '(unknown)'; \
print('DATABASE_URL host:', host); \
sys.exit(1 if 'render.com' in host else 0)" || exit 1

if ! python3 manage.py migrate --noinput; then
  echo "ERROR: Django migrate failed. Check DATABASE_URL in Railway Variables (must be Railway Postgres, not Render)."
  if [ -n "${RAILWAY_ENVIRONMENT:-}" ]; then
    exit 1
  fi
  echo "WARNING: continuing in non-Railway environment for local debug."
fi

echo "RigHand Railway start: launching web server on port ${PORT:-8000}"
exec gunicorn --bind "0.0.0.0:${PORT:-8000}" righand.wsgi:application
