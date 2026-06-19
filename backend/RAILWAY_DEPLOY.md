# RigHand on Railway

Use **one** web service: **Righand** (Django). It serves the React UI and `/api` together.

Do **not** run a separate `righand-frontend` Node service unless you know you need it — that causes split URLs and extra failures.

**Live URL:** https://righand-production.up.railway.app

## Righand service (main app)

| Setting | Value |
|---------|--------|
| **Source** | GitHub repo root |
| **Builder** | Dockerfile (`railway.toml` → `Dockerfile`) |
| **Start command** | `/app/backend/railway_start.sh` (set in `railway.toml`; do **not** use npm) |
| **Health check** | `/health` |

Railway reads `railway.toml` at repo root. The Dockerfile:

1. Builds React (`frontend/`)
2. Installs Django (`backend/`)
3. Runs `collectstatic`
4. Starts with `backend/railway_start.sh` (migrate + gunicorn on `$PORT`)

## Required environment variables

Link **Postgres** and set:

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (internal URL) |
| `DJANGO_ENV` | `production` |
| `SECRET_KEY` | random string |
| `JWT_SECRET_KEY` | random string |
| `REACT_APP_API_URL` | `/api` (build arg; default in Dockerfile) |

Optional:

| Variable | Purpose |
|----------|---------|
| `RAILWAY_PUBLIC_DOMAIN` | Auto-set by Railway → `ALLOWED_HOSTS` |
| `ALLOWED_HOSTS` | Extra hosts merged with defaults (`.railway.app` always kept) |
| `CORS_ORIGINS` | Only if UI is on another domain |
| Stripe keys | See `docs/STRIPE_RAILWAY_SETUP.md` |

## Custom domain

Point DNS (CNAME) to Railway’s target for the **Righand** service, then add the domain in Railway → **Righand** → Settings → Domains.  
`righand.gilliomfrontlinedigital.com` is in default `ALLOWED_HOSTS` and will serve the same app as `righand-production.up.railway.app` once DNS propagates.

## Verify after deploy

```text
GET /health          → 200 healthy
GET /api/            → 200 Righand API online
GET /                → React login page (HTML)
GET /health/billing  → 200 (Stripe config status in JSON)
```

## Start command (important)

The final Docker image is `python:3.11-slim` — Node.js is **not** installed at runtime (React is built in an earlier stage).

On the **Righand** service in Railway → **Settings** → **Deploy** → **Custom Start Command**:

- **Clear** any value such as `npm run start --if-present || npm start || node index.js`
- Leave it empty, or rely on `railway.toml` which sets `startCommand = "/app/backend/railway_start.sh"`

If npm is in the start command, the container exits immediately with `The executable npm could not be found.`

## If deploy fails

1. **Logs** → Righand service → Deployments → build + runtime logs  
2. Confirm **Postgres** is linked and `DATABASE_URL` is set (`${{Postgres.DATABASE_URL}}`)  
3. Confirm service uses **Dockerfile** builder (`railway.toml`), not Nixpacks/Procfile alone (no React build)  
4. **Suspend** the duplicate `righand-frontend` service — the root Dockerfile already bundles React  
5. Check `GET /health` JSON: `"database": "ok"` means Postgres is reachable  
6. Redeploy after pushing latest `main`

### Common Railway warnings

| Warning | Fix |
|---------|-----|
| Missing `SECRET_KEY` / `JWT_SECRET_KEY` | Generate random strings in Variables |
| Missing `DATABASE_URL` | Link Postgres service, reference `${{Postgres.DATABASE_URL}}` |
| Health check timeout | Check migrate logs; Postgres must be linked before deploy |
| `ALLOWED_HOSTS` / DisallowedHost | Ensure `.railway.app` is not removed from env override |
| Duplicate frontend service | Suspend `righand-frontend` (legacy split deploy) |
| `npm could not be found` at startup | Clear dashboard start command; use `railway.toml` startCommand |

## righand-frontend (legacy)

If you keep it: Root Directory `frontend`, build `npm install && npm run build`, start must use **`$PORT`**:

```bash
npx serve -s build -l $PORT
```

Hardcoding port `3000` will fail on Railway.
