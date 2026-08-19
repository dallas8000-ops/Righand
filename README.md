# RigHand AI

RigHand AI is a full-stack expense, profit, fleet, and transport compliance platform built for truck drivers and small carriers. It supports online and offline workflows, voice entry, tax-ready reports, jurisdiction-specific transport compliance, subscription tiers, and production deployment on **Railway**.

## 1. Product Summary

RigHand AI helps drivers record daily costs and load income, track trip miles, and automatically calculate net profit for the month.

Primary goals:
- Fast entry of expenses and income while on the road
- Offline-first operation with background sync
- Trip tracking: manual odometer, live GPS, or OBD-II dongle (Android)
- Country/region-based transport compliance for Uganda, Kenya, Rwanda, EAC cross-border routes, and the EU region
- **Subscription tiers** — Free, Compliance Pro ($34.99/mo), Fleet Lite ($89/mo) with payment-triggered unlock
- Admin tools to edit all data and set starting income (Pro)
- Tax-ready exports (Schedule C, IFTA, PDF, CSV) (Pro)
- Native Android app via Capacitor (web + tablet/phone)
- Secure user isolation and token-based authentication

## 2. Live Deployment

| Service | URL |
|---------|-----|
| Web app + API | https://righand-production.up.railway.app |
| Health check | https://righand-production.up.railway.app/health |
| Custom domain (CNAME → Railway) | https://righand.gilliomfrontlinedigital.com |
| Android app | Built locally — see [Section 12](#12-android-app-capacitor) |

Production uses **one Railway service** (`Righand`) at `righand-production.up.railway.app`. Do not use the legacy `righand-frontend-production` service — suspend it in Railway.

## 3. Features

### 3.0 Subscription Tiers

| Tier | Price | Unlocks |
|------|-------|---------|
| **Free** | $0 | Home, Money Log (add/history/receipts), basic profit summary, trip miles, weekly chart |
| **Compliance Pro** | $34.99/mo | Tax & IFTA reports, PDF/CSV export, HOS-lite, maintenance reminders, document/load packets, Admin panel, custom categories |
| **Fleet Lite** | $89/mo | Everything in Compliance Pro + up to 5 drivers, dispatcher view, live GPS sharing |

**How unlock works:**
1. New users start on **Free** (`GET /api/subscriptions/me` creates a `free` row).
2. After **Google Play** payment, the app calls `POST /api/subscriptions/verify-purchase` with the store `productId` and `googleOrderId`.
3. Backend sets `tier` to `pro` or `fleet`, logs the purchase, and emits a webhook to dbops-api.
4. **Fleet payment** also auto-creates a fleet (`Tenant` + owner membership) — no manual `setup_fleet.py` required.
5. UI refreshes and locked tabs unlock.

**Google Play product IDs** (configure in Railway **Righand** service env):

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

**Backend enforcement:** Pro-only API routes return `403` with `PRO_REQUIRED` if tier is `free`. UI shows upgrade screens on locked tabs (Tax & IFTA, HOS, Admin, Dispatch).

**Demo mode** never receives paid tiers — use a real account to test subscriptions.

### 3.1 Dashboard Tabs

| Tab | Tier | Description |
|-----|------|-------------|
| **Home** | Free | Driver cockpit, Quiet Watch automation alerts, fuel range, maintenance, net profit, weekly chart, trip tracker |
| **Loads** | Free | Load contract packets, rate/deadhead/fuel/toll scoring, trip packet text export, SMS share, log as income |
| **Compliance** | Free | Select Uganda, Kenya, Rwanda, EAC, or EU; upload transport documents; manage driver/vehicle/route profiles; review dispatch readiness |
| **Money Log** | Free | New Entry, History (search/filter/sort), Receipt gallery |
| **Tax & IFTA** | Compliance Pro | PDF/CSV export, Schedule C quarterly, IFTA fuel by state |
| **HOS** | Pro | Manual duty status with 11/14-hour countdown clocks (compliance assistant, not a certified ELD) |
| **Dispatch** | Fleet Lite | Multi-driver P&amp;L and GPS view (paid Fleet or manual admin setup) |
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

### 3.6 Tax & IFTA Reports (Compliance Pro)

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
| **Paid unlock** | User subscribes to Fleet Lite ($89/mo) in Google Play → `verify-purchase` auto-creates fleet |
| **Manual setup** | You (admin) run `setup_fleet.py` against production Postgres for legacy/support accounts |

**Requirements:**
- Real logged-in account (not demo mode)
- Fleet membership in the database (from payment or manual setup)

**Manual enable (admin CLI):**

```powershell
cd backend
$env:DJANGO_ENV = "production"
$env:DATABASE_URL = "postgresql://..."   # must be in quotes on PowerShell

python setup_fleet.py list-users
python setup_fleet.py create --owner-email owner@email.com --fleet-name "My Trucking LLC"
python setup_fleet.py add-driver --owner-email owner@email.com --driver-email driver@email.com
python setup_fleet.py status --owner-email owner@email.com
```

Then log out and back in → open **Fleet** tab.

**Roles:**

| Role | Dispatch tab shows |
|------|-----------------|
| `owner` / `dispatcher` | All drivers' income, expenses, net, last GPS ping |
| `driver` | GPS sharing; pings via `POST /api/fleet/location` |

**Android app — live GPS in UI:**

1. Fleet enabled for the account (payment or `setup_fleet.py`)
2. Rebuild and install the app: `npm run cap:sync` then `adb install -r ...`
3. Driver logs in (not demo) → **Fleet** tab → **Start sharing**
4. Allow location when Android prompts
5. Dispatcher/owner opens **Fleet** tab → **Refresh** → **Open in Maps** on driver card

### 3.9 Regional Transport Compliance

The **Compliance** tab turns RigHand into a jurisdiction-aware transport compliance assistant. It is designed for operations in Uganda, Kenya, Rwanda, EAC cross-border corridors, and the EU region.

Supported jurisdiction packs:

| Code | Region | Focus |
|------|--------|-------|
| `UG` | Uganda | 2026 vehicle load-control readiness, PSV driver monitoring, inspection/licence records, URA/EAC customs evidence |
| `KE` | Kenya | NTSA driver/operator records, inspection and insurance evidence, axle-load/weighbridge readiness, COMESA Yellow Card, KRA cargo/customs records |
| `RW` | Rwanda | Driver/vehicle/authorisation records, RRA customs, Electronic Single Window, COMESA Yellow Card, trade-portal procedure evidence |
| `EAC` | Cross-border East Africa | Customs declarations, bonds, manifests, COMESA Yellow Card or current insurance evidence, seal numbers, border posts, corridor/load-control prompts |
| `EU` | European Union | Driving/rest/working-time prompts, tachograph/driver-card records, cabotage/posting evidence, weights/dimensions, ADR readiness |

Compliance capabilities:
- Jurisdiction selector changes rule cards, required-document prompts, load-packet readiness, and cross-border checklists.
- Operating money labels and summaries follow the selected jurisdiction: UGX for Uganda, KES for Kenya, RWF for Rwanda, EUR for EU, and configurable USD fallback for EAC cross-border work.
- Text and selectable-text PDF uploads are scanned by the backend for matching rules and structured evidence.
- Extracted fields include dates, permit/reference IDs, vehicle plates, seal numbers, weights, driver names, and border posts.
- Review alerts flag expired or soon-expiring dates and weight records missing vehicle linkage.
- Driver, vehicle, and route compliance profiles persist for live accounts with local fallback for demo/offline use.
- COMESA Yellow Card / cross-border insurance references and country-specific axle/load source references are editable profile fields, not hardcoded legal constants.
- Load packet release is blocked when open critical compliance findings exist for the selected jurisdiction.

Current limitations:
- Image OCR and scanned-PDF OCR are not connected yet.
- AI-assisted extraction beyond deterministic matching is planned, but the current release uses rule packs, keyword matching, and structured pattern extraction.
- PDF/CSV report exports include the selected currency code so local-currency views are preserved outside the app.
- Axle-load limits, special-load thresholds, and COMESA Yellow Card digitization status can change by country. Store the verified source/date in the profile instead of relying on a baked-in number.
- Compliance guidance is an operational assistant, not legal advice. Official sources are tracked in [docs/TRANSPORT_COMPLIANCE_PLAN.md](docs/TRANSPORT_COMPLIANCE_PLAN.md).

### 3.10 Authentication and Security

- User registration and login
- JWT token authentication
- Password hashing
- User-level data isolation
- Admin password reset CLI: `python reset_password.py --email user@example.com`

**Important:** Production API base URL must include `/api`:

```
REACT_APP_API_URL=https://righand-production.up.railway.app/api
```

The frontend auto-appends `/api` if omitted, but set it correctly on Railway to avoid login failures.

### 3.11 Offline-First Experience

- IndexedDB local persistence (Dexie)
- Sync queue for offline changes
- Automatic background sync when connection returns
- **Demo mode** — full local CRUD without backend (use demo login; no paid tiers)

### 3.12 Driver-Oriented UX

- Header navigation (mobile-friendly)
- Light, Dark, and **Night Drive** themes
- Voice input: **Hold To Talk** and **Tap To Talk** on the expense form (see [Section 3.13](#313-voice-entry-hold--tap-to-talk))
- Push notification toggle for sync reminders
- Photorealistic truck console background on dashboard

### 3.13 Voice Entry (Hold / Tap To Talk)

Voice fills the **Description** field on the expense form. Two buttons sit under that field:

| Button | Behavior |
|--------|----------|
| **Hold To Talk** | Press and hold while speaking; release to finish |
| **Tap To Talk** | Tap once to start; tap **Stop** when done |

**Where it works**

| Platform | Engine | Notes |
|----------|--------|-------|
| Chrome / Edge (web) | Browser Web Speech API | Requires mic permission in the browser |
| RigHand Android app | `@capacitor-community/speech-recognition` | Native speech — **not** the browser API (Capacitor WebView does not expose `webkitSpeechRecognition`) |

**When voice is unavailable**

Buttons stay **visible but disabled** (grayed out). A hint appears under the buttons — you should never wonder silently why voice stopped working:

- *Allow microphone access to enable voice entry.* — permission not granted yet
- *Microphone blocked — allow mic access in Android settings.* — denied in Android app settings
- *Voice entry works in Chrome or the RigHand Android app with mic permission.* — unsupported browser
- *Voice requires an internet connection.* — network error during recognition

**Android requirements:** `RECORD_AUDIO` in `AndroidManifest.xml`, `@capacitor-community/speech-recognition` synced via `npx cap sync android`, and mic permission granted on first use. Rebuild and reinstall the APK after manifest or plugin changes.

**Regression note:** Early Capacitor builds only checked for browser speech APIs, so Hold/Tap To Talk appeared broken on Android tablets with no explanation. Fixed in **1.0.4-dev** — native plugin + visible disabled state + hints. See `CHANGELOG.md`.

## 4. Architecture

RigHand AI uses a two-tier architecture:
- **Frontend:** React single-page application
- **Backend:** Django REST API
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
- `@capacitor-community/speech-recognition` — Hold To Talk / Tap To Talk on Android

**Backend:**
- Django 4.2
- django-cors-headers
- PyJWT (API auth)
- Gunicorn
- ReportLab (PDF export)
- pypdf (selectable-text PDF compliance uploads)

**Data:**
- SQLite (development)
- PostgreSQL (Railway production)

**Deployment:**
- Railway (Dockerfile + `railway.toml`)
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

### Compliance — `/api/compliance`
- GET `/summary?jurisdictionCode=UG` — profile counts, readiness alerts, dispatch policy
- GET/POST `/documents` — list or create/upload scanned compliance documents
- DELETE `/documents/{document_id}` — remove a compliance document and findings
- GET/POST `/profiles` — list or save driver, vehicle, and route compliance profiles
- PUT/DELETE `/profiles/{profile_id}` — update or remove a compliance profile

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

### 7.1 Backend (Railway — Righand service)

Required:
- `DJANGO_ENV=production`
- `SECRET_KEY=<your secret>`
- `JWT_SECRET_KEY=<your secret>`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` — **must reference the Railway Postgres plugin**, not a manually pasted database URL
- `PYTHON_VERSION=3.11` (optional; Docker image uses 3.11)

**Important:** `DATABASE_URL` is **not** stored in this repo. It lives only in the Railway dashboard. Always reference the Railway Postgres plugin with `${{Postgres.DATABASE_URL}}` after adding/linking a Postgres service in the same Railway project - don't paste a database URL by hand.

Optional (subscriptions + purchase tracking):

```
GOOGLE_PRODUCT_PRO=righand_pro_monthly
GOOGLE_PRODUCT_FLEET=righand_fleet_monthly
DBOPS_WEBHOOK_URL=https://your-dbops-api/api/webhooks/righand
DBOPS_WEBHOOK_SECRET=<shared secret>
```

### 7.2 Frontend (baked into Dockerfile build)

The React UI is built inside the root `Dockerfile` — no separate frontend Railway service.

Build arg (default in Dockerfile):

```
REACT_APP_API_URL=/api
```

For local dev against production API:

```
REACT_APP_API_URL=https://righand-production.up.railway.app/api
```

## 8. Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
python manage.py check
python manage.py migrate --noinput
python manage.py runserver 0.0.0.0:8000
```

Run Railway/API smoke checks:

```bash
python burn_test.py
```

**Fleet admin CLI** (production Postgres):

```powershell
$env:DJANGO_ENV = "production"
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

**Use production API from local dev** (real accounts, fleet, subscriptions live on Railway):

Create `frontend/.env.local`:

```
REACT_APP_API_URL=/api
```

`package.json` includes `"proxy": "https://righand-production.up.railway.app"` so the dev server forwards `/api` to production without CORS errors.

Restart `npm start` after creating or changing `.env.local`.

**Test subscription unlock locally:** open a locked tab (Tax & IFTA, Admin) → click **Dev: simulate payment** (development mode only).

Local URLs:
- Frontend: http://localhost:3000 (or 3001 if 3000 is busy)
- Backend: http://localhost:8000 — preferred local app/API when running Django directly

## 9. Railway Deployment Reference

See **`backend/RAILWAY_DEPLOY.md`** for the full guide.

**Single service:**
- Source: GitHub repo root
- Builder: Dockerfile (`railway.toml`)
- Start: `/app/backend/railway_start.sh` (migrate + gunicorn)
- Health check: `/health`

Full guide: **`backend/RAILWAY_DEPLOY.md`**

## 10. Project Structure

```
RigHand/
├── backend/
│   ├── manage.py
│   ├── app.py                    # compatibility/entry helper
│   ├── migrate_subscriptions.py
│   ├── burn_test.py
│   ├── setup_fleet.py           # Fleet Lite admin CLI
│   ├── reset_password.py        # Password reset CLI
│   ├── subscription_service.py  # Tier upgrades, Play product mapping
│   ├── fleet_service.py         # Auto-provision fleet on paid unlock
│   ├── webhook_client.py        # dbops-api event emitter
│   ├── api/
│   │   ├── models.py
│   │   ├── schema_migrations.py
│   │   ├── jwt_auth.py
│   │   ├── tier_guard.py
│   │   ├── compliance_rules.py
│   │   ├── compliance_extractors.py
│   │   ├── compliance_review.py
│   │   └── views/
│   │       ├── auth.py
│   │       ├── categories.py
│   │       ├── compliance.py
│   │       ├── expenses.py
│   │       ├── fleet.py
│   │       ├── ops.py
│   │       ├── reports.py
│   │       └── subscriptions.py
│   ├── righand/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── views.py
│   └── requirements.txt
├── dbops-api/                   # Purchase tracking dashboard (separate service)
├── docs/
│   ├── TRANSPORT_COMPLIANCE_PLAN.md
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
│           ├── transportCompliance.js
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
6. **Tax & IFTA / Admin / HOS** show upgrade screen on Free tier
7. **Dev: simulate payment** or `POST /verify-purchase` unlocks Pro tabs
8. **Trip Miles** — Manual, GPS, and OBD modes work (Android for OBD)
9. **Compliance** — select Uganda/Kenya/Rwanda/EAC/EU and confirm checklist cards update
10. **Currency localization** — Uganda shows UGX, Kenya shows KES, Rwanda shows RWF, EU shows EUR, and PDF/CSV exports include the selected currency
11. **Compliance upload** — text or selectable PDF upload returns findings and extracted fields
12. **Compliance profiles** — driver, vehicle, and route profiles save and appear in readiness rollups
13. **Load dispatch** — open critical compliance findings block delivered/release flow
14. No browser CORS errors on production frontend

**Android app checklist:**
1. App installs and opens on device/tablet
2. Demo login works offline
3. GPS trip accumulates miles (location permission granted)
4. OBD connects to ELM327 dongle (Bluetooth permission granted)
5. Hold To Talk / Tap To Talk enabled (microphone permission granted; buttons not grayed out)
6. Live account syncs with `https://righand-production.up.railway.app`
7. Fleet GPS sharing works after Fleet tier enabled

## 12. Android App (Capacitor)

The Android app wraps the same React UI with native GPS and Bluetooth for trip tracking.

**App ID:** `com.righand.app`  
**Plugins:** Geolocation, Bluetooth LE (OBD-II), Speech Recognition (voice entry)

### First-time setup

```bash
cd frontend
npm install
npm run build
npx cap add android          # first time only
npx cap sync
```

Android SDK and Java 17 are required. Permissions (GPS, Bluetooth, **microphone**) are in `android/app/src/main/AndroidManifest.xml`. Full details: **`docs/capacitor-setup.md`**.

**Voice on tablet:** After changing speech plugins or mic permissions, run `npx cap sync android`, rebuild the APK, and reinstall. If Hold/Tap To Talk are grayed out, check the hint under the buttons and Android **Settings → Apps → RigHand → Permissions → Microphone**.

### Build debug APK (production API)

```bash
cd frontend
set REACT_APP_API_URL=https://righand-production.up.railway.app/api   # Windows CMD
# export REACT_APP_API_URL=https://righand-production.up.railway.app/api  # macOS/Linux

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
| `purchase_pro` | New Compliance Pro subscription ($34.99/mo) |
| `purchase_fleet` | New Fleet Lite subscription ($89/mo) |
| `renewal_pro` / `renewal_fleet` | Plan renewal |
| `milestone_3mo` | Subscriber active 90+ days |
| `cancel_pro` / `cancel_fleet` | Subscription cancelled |

## 14. License

Proprietary. All rights reserved.

## 15. Status

Production web app live on Railway. Android debug APK builds locally with Capacitor.

**Latest:** subscription tiers (Free / Pro / Fleet) with payment-triggered unlock, Pro API enforcement, upgrade UI, fleet auto-provisioning on Fleet purchase, admin CLI tools (`setup_fleet.py`, `reset_password.py`), purchase tracking via dbops-api, trip tracking (Manual / GPS / OBD), tabbed dashboard, reports, HOS clocks, fleet GPS sharing, themes, voice entry, and regional transport compliance for Uganda, Kenya, Rwanda, EAC cross-border routes, and the EU region.

