# RigHand on Railway

Use **one** web service: **Righand** (Django). It serves the React UI and `/api` together.

**Canonical URL:** https://righand-production.up.railway.app

Do **not** run a separate `righand-frontend` Node service — that causes split URLs and extra failures.

## Resolving the two-URL conflict

You may see **two** Railway URLs that both work:

| URL | What it is | Action |
|-----|------------|--------|
| `righand-production.up.railway.app` | **Righand** service (Dockerfile) — web + API together | **Keep** — this is production |
| `righand-frontend-production.up.railway.app` | Legacy **righand-frontend** service from old split deploy | **Suspend or delete** in Railway |

**Why both exist:** An older setup ran React on a separate Node service (`npx serve`) and Django on another. The repo now uses one Dockerfile that builds React and serves it from Django. The old `righand-frontend` service is redundant but may still be online with the same or similar code.

**What the repo uses today:**
- `frontend/src/services/api.js` → `https://righand-production.up.railway.app/api`
- `railway.toml` + root `Dockerfile` → deploys to **Righand** only
- Docker build bakes `REACT_APP_API_URL=/api` (same-origin on whichever host serves the app)

**Railway dashboard steps:**
1. Open **Righand** → confirm GitHub repo root, Dockerfile builder, latest deploy
2. Open **righand-frontend** → **Settings** → **Suspend Service** (or delete)
3. Use **Righand** public URL or custom domain `righand.gilliomfrontlinedigital.com` (after DNS)

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

## Keep production stable (do not change)

Once login works, avoid these common regressions:

| Do | Don't |
|----|--------|
| Keep **Postgres** in the same Railway project | Delete or suspend the Postgres service |
| Use `DATABASE_URL=${{Postgres.DATABASE_URL}}` | Paste a Render URL or old external DB string |
| Leave **Start command** empty (uses `railway.toml`) | Set `npm start` or any Node command |
| Use **Dockerfile** builder from repo root | Switch to Nixpacks/Procfile-only (skips React build) |
| Monitor `GET /health` → `"database": "ok"` | Ignore failed deploys / health check timeouts |
| Suspend legacy **righand-frontend** service | Run two web services with different URLs |

**Quick health check (weekly or after any Railway dashboard edit):**

```powershell
Invoke-RestMethod https://righand-production.up.railway.app/health
```

Expect: `status=healthy`, `database=ok`. If `database=unavailable` or login shows `render.com`, fix **Variables** before redeploying again.

**Your data lives in Railway Postgres.** Back up from Railway → Postgres → Backups before major changes. User accounts created with `create_user.py` are stored there — not in git or the APK.

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
| **`DATABASE_URL` still points to Render** (`*.oregon-postgres.render.com`) | **Not in git** — old value is saved in Railway → **Righand** → **Variables**. Delete it. Add a **Postgres** plugin in the project if missing. Set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` (reference variable, not a pasted URL). Redeploy. |
| Migrate fails / health check timeout | Startup runs `migrate` before Gunicorn; bad `DATABASE_URL` blocks the whole service |
| **`relation "users" does not exist`** | Fresh Railway Postgres — app tables are created at startup via `ensure_core_schema()` in `railway_start.sh`. Redeploy latest `main`, then create a user with `create_user.py`. |
| Health check timeout | Check migrate logs; Postgres must be linked before deploy |
| `ALLOWED_HOSTS` / DisallowedHost | Ensure `.railway.app` is not removed from env override |
| Duplicate frontend service | Suspend `righand-frontend` (legacy split deploy) |
| `npm could not be found` at startup | Clear dashboard start command; use `railway.toml` startCommand |

## Fix Render DATABASE_URL (login shows SSL / render.com error)

If login returns an error mentioning `oregon-postgres.render.com`, the **Righand** service still has the old Render Postgres URL in **Variables** — not in git.

1. Railway project → **+ New** → **Database** → **PostgreSQL** (skip if Postgres already exists)
2. **Righand** (web) → **Variables** → delete `DATABASE_URL` if it contains `render.com`
3. Add: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
4. **Deploy** → **Redeploy** Righand (latest `main` includes startup guardrails)

**Verify:**

```bash
curl https://righand-production.up.railway.app/health
# Expect: "database": "ok"

curl -X POST https://righand-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}'
# Expect: {"error":"Invalid credentials"} — NOT render.com / SSL errors
```

## Recreate login after switching to Railway Postgres

Railway Postgres starts **empty**. Accounts on Render are not copied automatically.

**Option A — Railway shell (recommended)**

1. Righand service → **Settings** → open a **Shell** (or use Railway CLI: `railway shell`)
2. Run:

```bash
cd /app/backend
python3 create_user.py \
  --email dallas8000@gmail.com \
  --name "Your Name" \
  --license YOUR-CDL-NUMBER
```

3. Enter password when prompted, then log in on the tablet or web.

**Option B — From your PC**

1. Railway → **Postgres** → **Connect** → copy the **public** `DATABASE_URL`
2. Locally:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://..."   # paste Railway public URL
python create_user.py --email dallas8000@gmail.com --name "Your Name" --license YOUR-CDL-NUMBER
```

**Reset password** (user already exists):

```powershell
python reset_password.py --email dallas8000@gmail.com
```

**List users:**

```powershell
python setup_fleet.py list-users
```

## righand-frontend (legacy)

If you keep it: Root Directory `frontend`, build `npm install && npm run build`, start must use **`$PORT`**:

```bash
npx serve -s build -l $PORT
```

Hardcoding port `3000` will fail on Railway.
