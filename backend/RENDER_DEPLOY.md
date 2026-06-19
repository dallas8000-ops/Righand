# RigHand — Django app (API + web UI)

> **Legacy:** This file describes Render deployment. **Production uses Railway** — see `RAILWAY_DEPLOY.md`.

One **Django** service serves everything:

- `/` — React login / dashboard (production build)
- `/api/` — REST API
- `/health` — health check
- `/admin/` — Django admin

## Render Web Service

1. **Root Directory:** `backend`
2. **Build Command:**
   ```bash
   pip install -r requirements.txt && cd ../frontend && npm install && npm run build
   ```
3. **Start Command:**
   ```bash
   gunicorn --bind 0.0.0.0:$PORT righand.wsgi:application
   ```
4. **Environment:**
   - `DJANGO_ENV=production`
   - `SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`
   - `REACT_APP_API_URL=/api` (same-origin API when UI is served by Django)
   - `CORS_ORIGINS` — only needed if you also host UI on another domain

## You do not need a separate Node/`serve` service

The old **righand-frontend** Render service (`npx serve -s build`) is optional. Point your main URL at this Django service instead.

## Local run

```bash
cd frontend && npm install && npm run build
cd ../backend && pip install -r requirements.txt
set DJANGO_ENV=development
python manage.py runserver
```

Open http://127.0.0.1:8000/
