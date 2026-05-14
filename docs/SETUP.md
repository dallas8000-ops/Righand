# RigHand AI - Full-Stack Application Setup & Deployment Guide

## 📋 Project Overview

RigHand AI is a full-stack logistics application that helps truck drivers track real-time expenses and net profit. The application consists of:

- **Frontend**: React application with offline data persistence
- **Backend**: Python Flask API with database management
- **Database**: SQLite (local) or PostgreSQL (production)
- **Features**:
  - User authentication and registration
  - Expense tracking with categories
  - Real-time profit calculation
  - Offline data persistence with sync queue
  - Multi-platform support

## 🏗️ Project Structure

```
RigHand/
├── frontend/                 # React frontend
│   ├── public/
│   │   └── index.html       # Main HTML
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API & DB services
│   │   ├── App.jsx          # Main app component
│   │   └── index.jsx        # Entry point
│   ├── package.json
│   └── .env.example         # Environment template
├── backend/                  # Python Flask API
│   ├── app.py               # Flask app factory
│   ├── models.py            # Database models
│   ├── routes_auth.py       # Authentication routes
│   ├── routes_expenses.py   # Expense routes
│   ├── config.py            # Configuration
│   ├── requirements.txt
│   └── .env.example         # Environment template
└── docs/                     # Documentation
    ├── SETUP.md             # Setup guide
    ├── API.md               # API documentation
    └── DEPLOYMENT.md        # Deployment guide
```

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ and npm
- Python 3.8+
- Git

### Step 1: Clone/Download the Project

```bash
cd RigHand
```

### Step 2: Set Up Backend

1. Navigate to backend folder:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings (or leave for defaults)
```

5. Initialize database:
```bash
python -c "from app import create_app; app = create_app(); print('Database initialized')"
```

6. Start backend server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

### Step 3: Set Up Frontend

1. Open new terminal, navigate to frontend:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env.local
# For demo mode testing, you can leave defaults
```

4. Start development server:
```bash
npm start
```

The frontend will open at `http://localhost:3000`

### Step 4: Test the Application

1. **Demo Mode** (no backend needed):
   - Click "Demo Mode" button on login screen
   - This loads sample data from IndexedDB

2. **Full Stack Testing**:
   - Use credentials to register a new account
   - Or login with test account (if created)
   - Test adding/updating/deleting expenses
   - Monitor sync status indicator

3. **Offline Testing**:
   - In browser DevTools, set Network to "Offline"
   - Add expenses - they save locally
   - Go back online - app auto-syncs

## 🔐 Features

### ✅ Milestone 1: Foundation
- [x] Firebase/Firestore database architecture (SQLite implementation)
- [x] User Authentication (JWT tokens)
- [x] Frontend-Backend connection with API layer
- [x] Database models for Users and Expenses

### ✅ Milestone 2: Road Ready Logic
- [x] Offline Data Persistence (Dexie/IndexedDB)
- [x] Sync Queue for pending changes
- [x] Expense Tracking (Create, Read, Update, Delete)
- [x] Profit Calculation engine
- [x] UI/UX polish with responsive design
- [x] Demo mode for testing

## 📱 Application Features

### User Management
- Registration with email and trucker license
- Secure password storage (bcrypt hashing)
- JWT-based authentication
- Session persistence across browser refresh

### Expense Tracking
- Add income and expenses with categories
- Categorize: Fuel, Maintenance, Tolls, Food, Other, Load Income
- Date-based tracking
- Bulk operations support

### Profit Calculation
- Monthly income vs expenses breakdown
- Real-time net profit calculation
- Date range filtering
- Offline calculation fallback

### Offline Capability
- IndexedDB local storage (Dexie)
- Automatic sync queue for offline changes
- Auto-sync when connection restored
- Sync status indicators

### Responsive Design
- Mobile-friendly interface
- Works on desktop, tablet, phone
- Optimized for truck cab screens

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/register` - Register new driver
- `POST /api/auth/login` - Login driver
- `GET /api/auth/verify` - Verify token
- `POST /api/auth/logout` - Logout

### Expenses
- `POST /api/expenses` - Create expense
- `GET /api/expenses/user/{userId}` - Get all expenses
- `PUT /api/expenses/{expenseId}` - Update expense
- `DELETE /api/expenses/{expenseId}` - Delete expense
- `GET /api/expenses/profit` - Calculate profit

See [API.md](API.md) for detailed documentation.

## 🔐 Protecting Code for Delivery

### Option 1: Compiled Distribution (Recommended)

Frontend:
```bash
cd frontend
npm run build
```
This creates a `build/` folder with minified, optimized code that's difficult to reverse-engineer.

Backend:
```bash
pip install pyinstaller
cd backend
pyinstaller --onefile app.py
```
This creates `dist/app.exe` (Windows) or `dist/app` (Linux)

### Option 2: Docker Containerization

Create `Dockerfile` for distribution:
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY backend/ .
RUN pip install -r requirements.txt
EXPOSE 5000
CMD ["python", "app.py"]
```

Users run via Docker without seeing source code.

### Option 3: Secure Distribution Package

1. Create encrypted archive:
```bash
zip -e -r righand-app.zip frontend/build backend/dist/
```

2. Provide:
   - Encrypted zip file
   - Installation instructions
   - `.env` template for configuration
   - Demo credentials
   - Testing guide

### Option 4: Web Hosting

Deploy on:
- Heroku (free tier available)
- AWS
- DigitalOcean
- Render.com

Users access via browser - no local code access.

## 📊 Database Schema

### Users Table
```sql
- id (String, Primary Key)
- email (String, Unique)
- password_hash (String)
- name (String)
- trucker_license (String)
- created_at (DateTime)
- updated_at (DateTime)
```

### Expenses Table
```sql
- id (String, Primary Key)
- user_id (String, Foreign Key)
- description (String)
- amount (Float)
- category (String)
- expense_type (String: 'expense' | 'income')
- expense_date (Date)
- notes (Text)
- is_synced (Boolean)
- created_at (DateTime)
- updated_at (DateTime)
```

### SyncLogs Table
```sql
- id (String, Primary Key)
- user_id (String, Foreign Key)
- action (String: 'CREATE' | 'UPDATE' | 'DELETE')
- entity_type (String)
- entity_id (String)
- status (String)
- error_message (Text)
- created_at (DateTime)
```

## 🧪 Testing Scenarios

### Scenario 1: User Registration
1. Navigate to frontend
2. Fill registration form
3. Click Register
4. Should receive token and redirect to dashboard

### Scenario 2: Add Expense
1. Login to dashboard
2. Click "Add Expense/Income"
3. Fill form with amount, category, date
4. Click "Save Entry"
5. Expense appears in table immediately

### Scenario 3: Offline Sync
1. Open DevTools (F12)
2. Go to Network tab
3. Set throttling to "Offline"
4. Add new expense
5. Should see "⧖ Pending Sync" status
6. Go back online
7. Should auto-sync and show "✓ Synced"

### Scenario 4: Profit Calculation
1. Add multiple expenses in current month
2. Add some income entries
3. Check "Monthly Income" and "Total Expenses"
4. Net Profit = Income - Expenses

## 🔧 Troubleshooting

### Backend won't start
- Check Python version: `python --version` (needs 3.8+)
- Check port 5000 is free: `lsof -i :5000` (macOS/Linux)
- Check venv is activated
- Check all dependencies installed: `pip list`

### Frontend can't connect to backend
- Check backend is running
- Check .env.local has correct API_URL
- Check CORS is enabled in backend
- Check firewall isn't blocking port 5000

### Offline not working
- Check browser supports IndexedDB
- Clear browser cache and try again
- Check DevTools > Application > Storage > IndexedDB

### Database issues
- Delete `backend/righand.db` to reset
- Reinitialize: `python -c "from app import create_app; create_app()"`

## 📚 Technology Stack

**Frontend:**
- React 18
- Dexie (IndexedDB wrapper)
- Axios (HTTP client)
- CSS (responsive design)

**Backend:**
- Flask (Python web framework)
- SQLAlchemy (ORM)
- JWT (authentication)
- SQLite/PostgreSQL (database)

**DevOps:**
- CORS for cross-origin requests
- Docker (optional containerization)
- Environment-based configuration

## 🎯 Next Steps for Production

1. **Database Migration**: Switch from SQLite to PostgreSQL
2. **Firebase Integration**: Add Firestore for cloud backup
3. **Authentication**: Integrate with Firebase Auth
4. **Deployment**: Deploy to cloud (Heroku, AWS, etc.)
5. **Monitoring**: Add error tracking (Sentry, LogRocket)
6. **Testing**: Add unit and integration tests
7. **API Optimization**: Add caching, rate limiting
8. **Security**: HTTPS, input validation, rate limiting

## 💡 Additional Notes

- All data is stored locally first (offline-first architecture)
- Changes auto-sync when connection is restored
- Demo mode works without any backend
- Application is fully functional offline
- Source code can be protected using compilation/containerization

---

**For more details, see:**
- [API Documentation](API.md)
- [Deployment Guide](DEPLOYMENT.md)
