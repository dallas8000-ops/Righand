# RigHand AI

RigHand AI is a full-stack expense and profit tracking platform built for truck drivers. It supports online and offline workflows, voice entry, tax-ready reports, and production deployment on Render.

## 1. Product Summary

RigHand AI helps drivers record daily costs and load income, track trip miles, and automatically calculate net profit for the month.

Primary goals:
- Fast entry of expenses and income while on the road
- Offline-first operation with background sync
- Trip odometer tracking (start miles → end miles → total)
- Admin tools to edit all data and set starting income
- Tax-ready exports (Schedule C, IFTA, PDF, CSV)
- Secure user isolation and token-based authentication

## 2. Live Deployment

- Frontend: https://righand-frontend.onrender.com
- Backend API: https://righand.onrender.com
- Health endpoint: https://righand.onrender.com/health

## 3. Features

### 3.1 Dashboard Tabs

| Tab | Description |
|-----|-------------|
| **Home** | Net profit hero, income/expense summary, pro metrics, weekly chart, trip tracker, quick templates |
| **Log** | New Entry, History (search/filter/sort), Receipt gallery |
| **Reports** | PDF/CSV export, Schedule C quarterly, IFTA fuel by state, weekly summary |
| **HOS** | Manual duty status with 11/14-hour countdown clocks (compliance assistant, not a certified ELD) |
| **Fleet** | Multi-driver P&amp;L and GPS view (Fleet Lite accounts) |
| **Admin** | Starting income, full entry table with edit/delete, quick add income/expense |

### 3.2 Income and Expense Entry

- Create, update, and delete expense or income entries
- Income/expense toggle with load category auto-selected for income
- Built-in categories: Fuel, Maintenance, Tolls, Food/Hotel, Other, Load/Freight Income
- Custom user-defined categories
- Quick templates (Fuel Stop, Toll, Food/Hotel, Maintenance, Load Income)
- Fields per entry:
  - Amount, description, date, miles, odometer
  - Fuel: gallons, fuel state (IFTA), auto MPG and $/gallon
  - Load income: broker, customer, deadhead miles, toll/fuel allocations
  - Receipt photo (stored as data URL locally / synced to server)

### 3.3 Trip Mileage Tracker

On the Home screen, drivers can:
1. Enter **beginning odometer** and tap **Start Trip**
2. See start miles and start time while driving (persists across refresh)
3. Enter **end odometer** and tap **End Trip** to see total miles
4. Tap **Log Miles** to pre-fill a load income entry with the trip total
5. Start the next trip with the last end reading pre-filled

Trip history is stored locally (last 30 trips).

### 3.4 Admin Panel

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

### 3.6 Reports and Export

- Monthly and weekly **PDF** reports
- **CSV** export (QuickBooks-friendly)
- **Schedule C** quarterly breakdown by category
- **IFTA** fuel summary by state (requires fuel state on fuel entries)
- Weekly email-style summary chart

### 3.7 HOS Countdown Lite

- Manual duty status: Off Duty, Sleeper, Driving, On Duty
- 11-hour driving and 14-hour on-duty countdown clocks
- Compliance assistant only — not a certified ELD

### 3.8 Fleet Lite (optional)

- Dispatcher view across multiple drivers
- Per-driver income, expenses, net profit
- Last known GPS location
- Requires Fleet Lite account (not available in demo mode)

### 3.9 Authentication and Security

- User registration and login
- JWT token authentication
- Password hashing
- User-level data isolation

### 3.10 Offline-First Experience

- IndexedDB local persistence (Dexie)
- Sync queue for offline changes
- Automatic background sync when connection returns
- **Demo mode** — full local CRUD without backend (use demo login)

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

**Frontend:**
- React 18
- Axios
- Dexie (IndexedDB)
- clsx

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
- POST `` (create)
- DELETE `/{category_id}`

### Reports — `/api/reports`
- GET `/metrics`
- GET `/export/csv`
- GET `/export/pdf`
- GET `/weekly-summary`
- GET `/tax/quarterly`
- GET `/ifta`

### Fleet — `/api/fleet`
- GET `/status`
- GET `/drivers/summary`
- POST `/location`
- GET/POST `/hos/status`

### System
- GET `/health`

## 7. Environment Variables

### 7.1 Backend (Render)

Required:
- `FLASK_ENV=production`
- `SECRET_KEY=<your secret>`
- `JWT_SECRET_KEY=<your secret>`
- `DATABASE_URL=<render internal postgres url>`
- `CORS_ORIGINS=https://righand-frontend.onrender.com`
- `PYTHON_VERSION=3.11.9`

### 7.2 Frontend (Render)

Required:
- `REACT_APP_API_URL=https://righand.onrender.com`

## 8. Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
python migrate.py    # add new columns to existing DB
python app.py
```

Run burn tests (demo income edit, API smoke):

```bash
python burn_test.py
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Local URLs:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

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
│   ├── burn_test.py
│   ├── routes_auth.py
│   ├── routes_expenses.py
│   ├── routes_categories.py
│   ├── routes_reports.py
│   ├── routes_fleet.py
│   └── requirements.txt
├── frontend/
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
│       │       └── ThemeSwitcher.jsx
│       ├── hooks/
│       ├── services/
│       └── utils/
└── README.md
```

## 11. Verification Checklist

After deployment, verify:
1. Backend `/health` returns status healthy
2. Frontend loads login screen
3. Demo mode opens dashboard
4. **+ Add Income** creates and saves a load payment
5. **Admin** tab shows entries and allows edit/delete
6. **Trip Miles** — start trip, end trip, total displays correctly
7. Reports tab loads quarterly tax and IFTA data
8. No browser CORS errors

## 12. Mobile APK Path (Later)

Current deployment is web-first. To convert to mobile later:
1. Keep backend API as is
2. Migrate frontend to React Native or wrap with Capacitor
3. Reuse auth and expense endpoints
4. Add mobile storage and permissions handling

## 13. License

Proprietary. All rights reserved.

## 14. Status

Production live on Render. Latest features include admin editing, trip mileage tracking, tabbed dashboard, reports (PDF/CSV/Schedule C/IFTA), HOS clocks, fleet view, themes, and voice entry.
