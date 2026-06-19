#!/bin/sh
set -u

echo "RigHand Railway start: preparing database"
python3 manage.py migrate --noinput || echo "WARNING: Django migrate failed; starting web server for health/debug visibility."

echo "RigHand Railway start: launching web server on port ${PORT:-8000}"
exec gunicorn --bind "0.0.0.0:${PORT:-8000}" righand.wsgi:application
