# RigHand AI

RigHand AI is a full-stack expense and profit tracking platform built for truck drivers. It supports online and offline workflows, voice entry, tax-ready reports, subscription tiers, and production deployment on Render.

## 1. Product Summary

RigHand AI helps drivers record daily costs and load income, track trip miles, and automatically calculate net profit for the month.

Primary goals:
- Fast entry of expenses and income while on the road
- Offline-first operation with background sync
- Trip tracking: manual odometer, live GPS, or OBD-II dongle (Android)
- **Subscription tiers** — Free, Pro ($45/mo), Fleet Lite ($99/mo) with payment-triggered unlock
- Admin tools to edit all data and set starting income (Pro)
- Tax-ready exports (Schedule C, IFTA, PDF, CSV) (Pro)
- Native Android app via Capacitor (web + tablet/phone)
- Secure user isolation and token-based authentication

## 2. Live Deployment

| Service | URL |
|---------|-----|
| Web app | https://righand-frontend.onrender.com |
| Backend API | https://righand.onrender.com |
| Health check | https://righand.onrender.com/health |
| Android app | Built locally — see [Section 12](#12-android-app-capacitor) |

## 3. Features

### 3.0 Subscription Tiers

| Tier | Price | Unlocks |
|------|-------|---------|
| **Free** | $0 | Home, Log (add/history/receipts), basic profit summary, weekly chart on Home |
| **Pro** | $45/mo | Reports (PDF/CSV, Schedule C, IFTA), HOS clocks, Admin panel, custom categories |
| **Fleet Lite** | $99/mo | Everything in Pro + multi-driver P&amp;L, dispatcher view, live GPS sharing |

**How unlock works:**
1. New users start on **Free** (`GET /api/subscriptions/me` creates a `free` row).
2. After **Google Play** payment, the app calls `POST /api/subscriptions/verify-purchase` with the store `productId` and `googleOrderId`.
3. Backend sets `tier` to `pro` or `fleet`, logs the purchase, and emits a webhook to dbops-api.
4. **Fleet payment** also auto-creates a fleet (`Tenant` + owner membership) — no manual `setup_fleet.py` required.
5. UI refreshes and locked tabs unlock.

**Google Play product IDs** (configure in Render backend env):

```
GOOGLE_PRODUCT_PRO=righand_pro_monthly
GOOGLE_PRODUCT_FLEET=righand_fleet_monthly
```

**Android billing callback** (after Play purchase succeeds):

```javascript
window.RigHandBilling?.onPurchase({
  orderId: purchase.orderId,
  productId: purchase.productId,
});
```

**Backend enforcement:** Pro-only API routes return `403` with `PRO_REQUIRED` if tier is `free`. UI shows upgrade screens on locked tabs (Reports, HOS, Admin, Fleet).

**Demo mode** never receives paid tiers — use a real account to test subscriptions.

### 3.1 Dashboard Tabs

| Tab | Tier | Description |
|-----|------|-------------|
| **Home** | Free | Net profit hero, income/expense summary, pro metrics, weekly chart, trip tracker, quick templates |
| **Log** | Free | New Entry, History (search/filter/sort), Receipt gallery |
| **Reports** | Pro | PDF/CSV export, Schedule C quarterly, IFTA fuel by state |
| **HOS** | Pro | Manual duty status with 11/14-hour countdown clocks (compliance assistant, not a certified ELD) |
| **Fleet** | Fleet Lite | Multi-driver P&amp;L and GPS view (paid Fleet or manual admin setup) |
| **Admin** | Pro | Starting income, full entry table with edit/delete, quick add income/expense |

### 3.2 Income and Expense Entry

- Create, update, and delete expense or income entries
- Income/expense toggle with load category auto-selected for income
- Built-in categories: Fuel, Maintenance, Tolls, Food/Hotel, Other, Load/Freight Income
- Custom user-defined categories (**Pro**)
- Quick templates (Fuel Stop, Toll, Food/Hotel, Maintenance, Load Income)
- Fields per entry:
  - Amount, description, date, miles, odometer
  - Fuel: gallons, fuel state (IFTA), auto MPG and $/gallon
  - Load income: broker, customer, deadhead miles, toll/fuel allocations
  - Receipt photo (stored as data URL locally / synced to server)

### 3.3 Trip Mileage Tracker

Three modes on the Home screen:

| Mode | Platform | Description |
|------|----------|-------------|
| **Manual** | Web + Android | Beginning/end odometer, total on End Trip |
| **GPS** | Web + Android | Live mile accumulation from device GPS, speed display |
| **OBD** | Android app only | ELM327 BLE dongle — speed, RPM, fuel %, odometer (when supported) |

Manual flow:
1. Enter **beginning odometer** → **Start Trip**
2. Enter **end odometer** → **End Trip** → total miles
3. **Log Miles** pre-fills a load income entry

GPS flow: **Start GPS Trip** → live miles while driving → **End Trip** → total + duration.

OBD flow: **Connect OBD + Start** → vehicle gauges + GPS backup → **End Trip** (prefers OBD odometer when available).

Trip history is stored locally (last 30 trips).

**Android permissions required:** Location (GPS), Bluetooth / Nearby devices (OBD). Grant when prompted on first use.

See [Section 12](#12-android-app-capacitor) for building and installing the Android app.

### 3.4 Admin Panel (Pro)

- Set **starting/opening income** for the month (added to logged load payments)
- View and edit **all entries** in one table
- Quick **+ Income** / **+ Expense** shortcuts
- Delete any entry

### 3.5 Pro Metrics (Home)

- Profit per mile
- Fuel cost per mile
- Cost per gallon
- Loaded miles
- Weekly bar chart (income vs expenses)

### 3.6 Reports and Export (Pro)

- Monthly and weekly **PDF** reports
- **CSV** export (QuickBooks-friendly)
- **Schedule C** quarterly breakdown by category
- **IFTA** fuel summary by state (requires fuel state on fuel entries)
- Weekly summary chart (also on Home — free)

### 3.7 HOS Countdown Lite (Pro)

- Manual duty status: Off Duty, Sleeper, Driving, On Duty
- 11-hour driving and 14-hour on-duty countdown clocks
- Compliance assistant only — not a certified ELD

### 3.8 Fleet Lite

Multi-driver P&amp;L and live GPS for carriers with up to 5 drivers.

**Two ways to enable Fleet:**

| Method | When to use |
|--------|-------------|
| **Paid unlock** | User subscribes to Fleet Lite ($99/mo) in Google Play → `verify-purchase` auto-creates fleet |
| **Manual setup** | You (admin) run `setup_fleet.py` against production Postgres for legacy/support accounts |

**Requirements:**
- Real logged-in account (not demo mode)
- Fleet membership in the database (from payment or manual setup)

**Manual enable (admin CLI):**

```powershell
cd backend
$env:FLASK_ENV = "production"
$env:DATABASE_URL = "postgresql://..."   # must be in quotes on PowerShell

python setup_fleet.py list-users
python setup_fleet.py create --owner-email owner@email.com --fleet-name "My Trucking LLC"
python setup_fleet.py add-driver --owner-email owner@email.com --driver-email driver@email.com
python setup_fleet.py status --owner-email owner@email.com
```

Then log out and back in → open **Fleet** tab.

**Roles:**

| Role | Fleet tab shows |
|------|-----------------|
| `owner` / `dispatcher` | All drivers' income, expenses, net, last GPS ping |
| `driver` | GPS sharing; pings via `POST /api/fleet/location` |

**Android app — live GPS in UI:**

1. Fleet enabled for the account (payment or `setup_fleet.py`)
2. Rebuild and install the app: `npm run cap:sync` then `adb install -r ...`
3. Driver logs in (not demo) → **Fleet** tab → **Start sharing**
4. Allow location when Android prompts
5. Dispatcher/owner opens **Fleet** tab → **Refresh** → **Open in Maps** on driver card

### 3.9 Authentication and Security

- User registration and login
- JWT token authentication
- Password hashing
- User-level data isolation
- Admin password reset CLI: `python reset_password.py --email user@example.com`

**Important:** Production API base URL must include `/api`:

```
REACT_APP_API_URL=https://righand.onrender.com/api
```

The frontend auto-appends `/api` if omitted, but set it correctly on Render to avoid login failures.

### 3.10 Offline-First Experience

- IndexedDB local persistence (Dexie)
- Sync queue for offline changes
- Automatic background sync when connection returns
- **Demo mode** — full local CRUD without backend (use demo login; no paid tiers)

### 3.11 Driver-Oriented UX

- Header navigation (mobile-friendly)
- Light, Dark, and **Night Drive** themes
- Voice input: Hold To Talk and Tap To Talk (browser speech recognition)
- Push notification toggle for sync reminders
- Photorealistic truck console background on dashboard

## 4. Architecture

RigHand AI uses a two-tier architecture:
- **Frontend:** React single-page application
- **Backend:** Flask REST API
- **Database:** SQLite locally, PostgreSQL in production

High-level flow:
1. Frontend writes instantly to local IndexedDB
2. Frontend attempts API sync in background
3. Backend validates JWT and writes to SQL database
4. Frontend updates local records with sync status

Local-only settings (starting income, active trip, trip history) use browser `localStorage`.

## 5. Technology Stack

**Frontend / Web:**
- React 18
- Axios
- Dexie (IndexedDB)
- clsx

**Mobile (Capacitor 6):**
- `@capacitor/core`, `@capacitor/android`
- `@capacitor/geolocation` — live GPS trip miles
- `@capacitor-community/bluetooth-le` — ELM327 OBD-II dongles

**Backend:**
- Flask
- Flask-JWT-Extended
- Flask-SQLAlchemy
- Flask-CORS
- Gunicorn
- ReportLab (PDF export)

**Data:**
- SQLite (development)
- PostgreSQL (Render production)

**Deployment:**
- Render Web Services
- GitHub integration

## 6. API Overview

### Authentication — `/api/auth`
- POST `/register`
- POST `/login`
- GET `/verify`
- POST `/logout`

### Expenses — `/api/expenses`
- POST `` (create)
- GET `/user/{user_id}` (list)
- PUT `/{expense_id}` (update)
- DELETE `/{expense_id}` (delete)
- GET `/profit` (period profit summary)

### Categories — `/api/categories`
- GET `` (list user categories)
- POST `` (create) — **Pro required**
- DELETE `/{category_id}` — **Pro required**

### Reports — `/api/reports`
- GET `/metrics` (free)
- GET `/weekly-summary` (free)
- GET `/export/csv` — **Pro required**
- GET `/export/pdf` — **Pro required**
- GET `/tax/quarterly` — **Pro required**
- GET `/ifta` — **Pro required**

### Fleet — `/api/fleet`
- GET `/status`
- GET `/drivers/summary`
- POST `/location`
- GET/POST `/hos/status` — **Pro required**

### System
- GET `/health`

### Subscriptions — `/api/subscriptions`
- GET `/me` (JWT) — tier (`free` | `pro` | `fleet`), subscriber ID (e.g. `RH-00142`), Play product IDs
- GET `/events` (JWT) — purchase event history for current user
- POST `/verify-purchase` (JWT) — **primary unlock path** after Google Play payment
- POST `/activate` (JWT) — manual upgrade to `pro` or `fleet` (testing/support)
- POST `/renew` (JWT) — record rebill/renewal
- POST `/cancel` (JWT) — downgrade to free
- POST `/update-used` (JWT) — increment free-tier update counter

**Verify purchase body:**

```json
{
  "productId": "righand_pro_monthly",
  "googleOrderId": "GPA.xxxx",
  "googleProductId": "optional",
  "purchaseToken": "optional"
}
```

### Purchase tracking (dbops-api) — separate service
- POST `/api/webhooks/righand` — receive events from RigHand (`X-Webhook-Secret`)
- GET `/api/webhooks/righand/events` — list events for dashboard (`X-Admin-Secret`)
- GET `/api/webhooks/righand/summary` — MRR / purchase stats (`X-Admin-Secret`)

See **`dbops-api/`** folder and [Section 13](#13-purchase-tracking-dashboard-dbops-api).

## 7. Environment Variables

### 7.1 Backend (Render)

Required:
- `FLASK_ENV=production`
- `SECRET_KEY=<your secret>`
- `JWT_SECRET_KEY=<your secret>`
- `DATABASE_URL=<render internal postgres url>`
- `CORS_ORIGINS=https://righand-frontend.onrender.com,http://localhost:3000,http://localhost:3001`
- `PYTHON_VERSION=3.11.9`

Optional (subscriptions + purchase tracking):

```
GOOGLE_PRODUCT_PRO=righand_pro_monthly
GOOGLE_PRODUCT_FLEET=righand_fleet_monthly
DBOPS_WEBHOOK_URL=https://your-dbops-api/api/webhooks/righand
DBOPS_WEBHOOK_SECRET=<shared secret>
```

### 7.2 Frontend (Render)

Required:

```
REACT_APP_API_URL=https://righand.onrender.com/api
```

**Must include `/api`** — login and all API calls depend on it.

## 8. Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
python migrate.py                # add new columns to existing DB
python migrate_subscriptions.py  # subscription tables
python app.py
```

Run burn tests (demo income edit, API smoke):

```bash
python burn_test.py
```

**Fleet admin CLI** (production Postgres):

```powershell
$env:FLASK_ENV = "production"
$env:DATABASE_URL = "postgresql://..."   # quotes required in PowerShell
python setup_fleet.py list-users
```

**Reset a user password:**

```powershell
python reset_password.py --email user@example.com
```

### Frontend

```bash
cd frontend
npm install
npm start
```

**Use production API from local dev** (real accounts, fleet, subscriptions live on Render):

Create `frontend/.env.local`:

```
REACT_APP_API_URL=/api
```

`package.json` includes `"proxy": "https://righand.onrender.com"` so the dev server forwards `/api` to production without CORS errors.

Restart `npm start` after creating or changing `.env.local`.

**Test subscription unlock locally:** open a locked tab (Reports, Admin) → click **Dev: simulate payment** (development mode only).

Local URLs:
- Frontend: http://localhost:3000 (or 3001 if 3000 is busy)
- Backend (optional): http://localhost:5000 — only needed if not using production proxy

## 9. Render Deployment Reference

**Backend service:**
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn --bind 0.0.0.0:$PORT app:app`

**Frontend service:**
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Start Command: `npx serve -s build -l $PORT`

## 10. Project Structure

```
RigHand/
├── backend/
│   ├── app.py
│   ├── models.py
│   ├── migrate.py
│   ├── migrate_subscriptions.py
│   ├── burn_test.py
│   ├── setup_fleet.py           # Fleet Lite admin CLI
│   ├── reset_password.py        # Password reset CLI
│   ├── subscription_service.py  # Tier upgrades, Play product mapping
│   ├── tier_guard.py            # @require_pro route decorator
│   ├── fleet_service.py         # Auto-provision fleet on paid unlock
│   ├── webhook_client.py        # dbops-api event emitter
│   ├── routes_auth.py
│   ├── routes_expenses.py
│   ├── routes_categories.py
│   ├── routes_reports.py
│   ├── routes_fleet.py
│   ├── routes_subscriptions.py
│   └── requirements.txt
├── dbops-api/                   # Purchase tracking dashboard (separate service)
├── docs/
│   └── capacitor-setup.md
├── frontend/
│   ├── android/                  # Capacitor Android project (generated)
│   ├── capacitor.config.json
│   ├── releases/                 # Built APK copies (local)
│   ├── .env.local                # local dev → production API (not committed)
│   ├── public/
│   │   └── truck-console-bg.png
│   └── src/
│       ├── components/
│       │   ├── Dashboard.jsx
│       │   └── dashboard/
│       │       ├── AdminPanel.jsx
│       │       ├── TripTracker.jsx
│       │       ├── WeeklyChart.jsx
│       │       ├── ReceiptGallery.jsx
│       │       ├── FleetDashboard.jsx
│       │       ├── UpgradeGate.jsx   # Pro/Fleet paywall UI
│       │       └── ThemeSwitcher.jsx
│       ├── hooks/
│       │   ├── useGpsTrip.js
│       │   ├── useObd.js
│       │   ├── useFleetLocation.js
│       │   ├── useSubscription.js
│       │   ├── useTheme.js
│       │   └── useNotifications.js
│       ├── services/
│       └── utils/
│           ├── tripTracker.js
│           └── driverSettings.js
└── README.md
```

## 11. Verification Checklist

After deployment, verify:
1. Backend `/health` returns status healthy
2. Frontend loads login screen
3. Demo mode opens dashboard (Free tier — Pro tabs locked)
4. Real account login works (`REACT_APP_API_URL` must include `/api`)
5. **+ Add Income** creates and saves a load payment
6. **Reports / Admin / HOS** show upgrade screen on Free tier
7. **Dev: simulate payment** or `POST /verify-purchase` unlocks Pro tabs
8. **Trip Miles** — Manual, GPS, and OBD modes work (Android for OBD)
9. No browser CORS errors on production frontend

**Android app checklist:**
1. App installs and opens on device/tablet
2. Demo login works offline
3. GPS trip accumulates miles (location permission granted)
4. OBD connects to ELM327 dongle (Bluetooth permission granted)
5. Live account syncs with `https://righand.onrender.com`
6. Fleet GPS sharing works after Fleet tier enabled

## 12. Android App (Capacitor)

The Android app wraps the same React UI with native GPS and Bluetooth for trip tracking.

**App ID:** `com.righand.app`  
**Plugins:** Geolocation, Bluetooth LE (OBD-II)

### First-time setup

```bash
cd frontend
npm install
npm run build
npx cap add android          # first time only
npx cap sync
```

Android SDK and Java 17 are required. Permissions (GPS, Bluetooth) are in `android/app/src/main/AndroidManifest.xml`. Full details: **`docs/capacitor-setup.md`**.

### Build debug APK (production API)

```bash
cd frontend
set REACT_APP_API_URL=https://righand.onrender.com/api   # Windows CMD
# export REACT_APP_API_URL=https://righand.onrender.com/api  # macOS/Linux

npm run build
npx cap sync android
cd android
gradlew.bat assembleDebug    # Windows
# ./gradlew assembleDebug    # macOS/Linux
```

**Output APK:**
- `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
- Copy to `frontend/releases/RigHand-AI-debug.apk` (optional)

### Install on USB-connected tablet or phone

1. Enable **Developer options** and **USB debugging** on the device
2. Connect via USB (USB-C or other)
3. Verify device is detected:

```bash
adb devices
```

4. Install (or reinstall) the APK:

```bash
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

5. Launch the app:

```bash
adb shell am start -n com.righand.app/.MainActivity
```

Or sideload the APK file directly on the device without a PC.

### npm shortcuts

```bash
npm run cap:sync      # build React + sync to android/
npm run cap:android   # open Android Studio
```

### Play Store release

In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle (AAB)**.  
Output: `android/app/release/app-release.aab`

Create subscription products in Google Play Console matching backend env vars (`GOOGLE_PRODUCT_PRO`, `GOOGLE_PRODUCT_FLEET`). Wire Play Billing to call `window.RigHandBilling.onPurchase(...)` after a successful purchase.

## 13. Purchase Tracking Dashboard (dbops-api)

RigHand emits purchase and milestone events to a separate **dbops-api** service for your personal revenue dashboard.

### Flow

1. Driver pays in Google Play (Pro or Fleet product)
2. App calls `POST /api/subscriptions/verify-purchase` with order ID + product ID
3. RigHand sets tier, unlocks features (and auto-creates fleet for Fleet tier)
4. RigHand POSTs event to dbops-api webhook
5. dbops-api logs to `righand_events.jsonl`
6. Open dashboard at `http://localhost:5001/` to view MRR, purchases, 3-month milestones

Manual/testing path: `POST /api/subscriptions/activate` with `{ "tier": "pro" }` or `{ "tier": "fleet" }`.

### Run dbops-api locally

```bash
cd dbops-api
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Dashboard: http://localhost:5001/ (enter `ADMIN_SECRET` to connect)

### Configure RigHand backend

```
DBOPS_WEBHOOK_URL=http://localhost:5001/api/webhooks/righand
DBOPS_WEBHOOK_SECRET=<same as dbops-api>
```

### Webhook events

| Event | When |
|-------|------|
| `purchase_pro` | New Pro subscription ($45/mo) |
| `purchase_fleet` | New Fleet Lite subscription ($99/mo) |
| `renewal_pro` / `renewal_fleet` | Plan renewal |
| `milestone_3mo` | Subscriber active 90+ days |
| `cancel_pro` / `cancel_fleet` | Subscription cancelled |

## 14. License

Proprietary. All rights reserved.

## 15. Status

Production web app live on Render. Android debug APK builds locally with Capacitor.

**Latest:** subscription tiers (Free / Pro / Fleet) with payment-triggered unlock, Pro API enforcement, upgrade UI, fleet auto-provisioning on Fleet purchase, admin CLI tools (`setup_fleet.py`, `reset_password.py`), purchase tracking via dbops-api, trip tracking (Manual / GPS / OBD), tabbed dashboard, reports, HOS clocks, fleet GPS sharing, themes, and voice entry.
