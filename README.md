# RigHand AI

RigHand AI is a full-stack expense and profit tracking platform built for truck drivers. It supports online and offline workflows, secure authentication, and production deployment on Render.

## 1. Product Summary

RigHand AI helps drivers record daily costs and load income, then automatically calculate net profit for a selected period.

Primary goals:
- Fast entry of expenses and income while on the road
- Offline-first operation with background sync
- Secure user isolation and token-based authentication
- Easy cloud deployment for demos and client review

## 2. Live Deployment

- Frontend: https://righand-frontend.onrender.com
- Backend API: https://righand.onrender.com
- Health endpoint: https://righand.onrender.com/health

## 3. Core Features

### 3.1 Authentication and Security
- User registration and login
- JWT token authentication
- Password hashing
- User-level data isolation

### 3.2 Expense and Profit Management
- Create, update, delete expense or income entries
- Category-based tracking
- Date-based profit calculation
- Dashboard summary cards

### 3.3 Offline-First Experience
- IndexedDB local persistence
- Sync queue for offline changes
- Automatic background sync when connection returns

### 3.4 Driver-Oriented UX
- Demo mode for quick testing
- Quick entry templates
- Search, filter, and sorting
- Night Drive mode for low-glare visibility
- Voice input support (browser speech recognition)

## 4. Architecture

RigHand AI uses a two-tier architecture:
- Frontend: React single-page application
- Backend: Flask REST API
- Database: SQLite locally, PostgreSQL in production

High-level flow:
1. Frontend writes instantly to local IndexedDB
2. Frontend attempts API sync in background
3. Backend validates JWT and writes to SQL database
4. Frontend updates local records with sync status

## 5. Technology Stack

Frontend:
- React 18
- Axios
- Dexie (IndexedDB wrapper)
- React Router

Backend:
- Flask
- Flask-JWT-Extended
- Flask-SQLAlchemy
- Flask-CORS
- Gunicorn

Data:
- SQLite (development)
- PostgreSQL (Render production)

Deployment:
- Render Web Services
- GitHub integration

## 6. API Overview

Authentication routes:
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/verify
- POST /api/auth/logout

Expense routes:
- POST /api/expenses
- GET /api/expenses/user/{user_id}
- PUT /api/expenses/{expense_id}
- DELETE /api/expenses/{expense_id}
- GET /api/expenses/profit

System routes:
- GET /health

## 7. Environment Variables

### 7.1 Backend (Render)
Required:
- FLASK_ENV=production
- SECRET_KEY=<your secret>
- JWT_SECRET_KEY=<your secret>
- DATABASE_URL=<render internal postgres url>
- CORS_ORIGINS=https://righand-frontend.onrender.com
- PYTHON_VERSION=3.11.9

### 7.2 Frontend (Render)
Required:
- REACT_APP_API_URL=https://righand.onrender.com

## 8. Local Development

Backend:
1. Open terminal in backend
2. Install dependencies: pip install -r requirements.txt
3. Run API: python app.py

Frontend:
1. Open terminal in frontend
2. Install dependencies: npm install
3. Run app: npm start

Local URLs:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## 9. Render Deployment Reference

Backend service:
- Root Directory: backend
- Build Command: pip install -r requirements.txt
- Start Command: gunicorn --bind 0.0.0.0:$PORT app:app

Frontend service:
- Root Directory: frontend
- Build Command: npm install && npm run build
- Start Command: npx serve -s build -l $PORT

## 10. Project Structure

RigHand/
- backend/
  - app.py
  - config.py
  - models.py
  - routes_auth.py
  - routes_expenses.py
  - requirements.txt
- frontend/
  - src/
    - components/
    - services/
  - package.json
- docs/
- README.md

## 11. Verification Checklist

After deployment, verify:
1. Backend health endpoint returns status healthy
2. Frontend loads login screen
3. Demo mode opens dashboard
4. New entry can be created and refreshed
5. No browser CORS errors

## 12. Mobile APK Path (Later)

Current deployment is web-first. To convert to mobile later:
1. Keep backend API as is
2. Migrate frontend to React Native or wrap with Capacitor
3. Reuse auth and expense endpoints
4. Add mobile storage and permissions handling

## 13. License

Proprietary. All rights reserved.

## 14. Status

Production live on Render.
