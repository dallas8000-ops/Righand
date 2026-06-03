# RigHand AI Backend (Django)

1. Push code to GitHub.
2. Create a Render Web Service pointing at the `backend` folder.
3. Configure:
   - Runtime: Python 3.x
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn --bind 0.0.0.0:$PORT righand.wsgi:application`
4. Environment variables:
   - `DJANGO_ENV=production` (or `FLASK_ENV=production` — still supported)
   - `SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`
   - `CORS_ORIGINS` (comma-separated frontend URLs)
   - `ALLOWED_HOSTS` (your Render hostname, or `*`)
5. Deploy and verify:
   - `GET /` — service info (200)
   - `GET /health` — health check (200)
   - `GET /api/auth/verify` — requires Bearer token

# Frontend (React)

Deploy separately with `serve -s build`. Point `REACT_APP_API_URL` at this backend.
