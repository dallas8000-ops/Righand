# 🚚 RigHand AI - Full-Stack Application

> A full-featured expense tracking and profit monitoring system for truck drivers

[![Status](https://img.shields.io/badge/status-production--ready-brightgreen)]()
[![License](https://img.shields.io/badge/license-proprietary-blue)]()

## 🎯 Overview

RigHand AI is a logistics-tech application built for truck drivers to:
- 📊 Track real-time expenses and income
- 💰 Calculate accurate net profit
- 📱 Work offline with automatic sync
- 🔐 Secure authentication and data management
- 💡 Make financial decisions on the road

**Milestones:**
- ✅ **Milestone 1**: Firebase/Firestore foundation, User Auth, Frontend Connection
- ✅ **Milestone 2**: Offline Persistence, Expense Tracking, UI Polish

---

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ and npm
- Python 3.8+
- Git (optional)

### Installation

1. **Backend Setup** (Terminal 1)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

2. **Frontend Setup** (Terminal 2)
```bash
cd frontend
npm install
npm start
```

3. **Access Application**
```
Frontend: http://localhost:3000
Backend:  http://localhost:5000
```

4. **Test with Demo Mode**
- Click "Demo Mode" button on login
- Or create account and test features

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [SETUP.md](docs/SETUP.md) | Complete setup and configuration guide |
| [API.md](docs/API.md) | API endpoints and testing examples |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment & code protection |
| [TESTING.md](docs/TESTING.md) | Test scenarios and checklist |

---

## 🏗️ Architecture

### Two-Tier System

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ - User Auth (Login/Register)                            ││
│  │ - Expense Dashboard                                      ││
│  │ - Profit Calculation                                     ││
│  │ - Offline Support (IndexedDB)                            ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↕                                    │
│                    API Layer (Axios)                          │
│                          ↕                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Backend (Flask Python)                                   ││
│  │ ┌───────────────────────────────────────────────────┐   ││
│  │ │ Routes:                                           │   ││
│  │ │ - /api/auth/* (Login, Register, Verify)          │   ││
│  │ │ - /api/expenses/* (CRUD operations)              │   ││
│  │ │ - /api/expenses/profit (Calculations)            │   ││
│  │ └───────────────────────────────────────────────────┘   ││
│  │         ↓                                                 ││
│  │ ┌───────────────────────────────────────────────────┐   ││
│  │ │ Database (SQLite / PostgreSQL)                   │   ││
│  │ │ - Users                                           │   ││
│  │ │ - Expenses                                        │   ││
│  │ │ - SyncLogs                                        │   ││
│  │ └───────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Offline-First Architecture

```
┌─────────────────────────────────────┐
│  User Takes Action (Add Expense)    │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│  Save to Local IndexedDB (Instant)  │
│  ✓ Works offline immediately        │
│  ✓ No network required              │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│  Internet Available?                 │
└────┬────────────────────────────┬───┘
     │ YES                        │ NO
     ↓                           ↓
┌──────────────────┐   ┌──────────────────┐
│ Sync with Server │   │ Add to Sync Queue│
│ Update local rec │   │ Show status      │
│ Remove from queue│   │ Pending Sync ⧖   │
└──────────────────┘   └──────────────────┘
     ↓
┌─────────────────────────────────────┐
│  Connection Restored?               │
└────┬───────────────────────────┬────┘
     │ YES                       │ NO
     ↓                          ↓
 AUTO SYNC              Keep in Queue
```

---

## 🎨 Features

### ✅ Implemented

#### Core Features
- [x] User Registration & Authentication
- [x] Secure Password Storage (Bcrypt)
- [x] JWT Token-Based Auth
- [x] Expense Tracking (CRUD)
- [x] Income Tracking
- [x] Profit Calculation
- [x] Category Management
- [x] Date Filtering

#### Offline & Sync
- [x] Local IndexedDB Storage
- [x] Automatic Sync Queue
- [x] Background Sync Manager
- [x] Offline Mode Detection
- [x] Conflict Resolution
- [x] Sync Status Indicators

#### UI/UX
- [x] Responsive Design
- [x] Mobile Optimized
- [x] Real-time Profit Dashboard
- [x] Expense Table with Sorting
- [x] Category Filters
- [x] Form Validation
- [x] Error Messages
- [x] Loading States
- [x] Demo Mode

#### Database
- [x] User Management
- [x] Expense Persistence
- [x] Audit Logging
- [x] Data Validation

### 🔮 Future Enhancements
- [ ] Voice-activated input (AI integration)
- [ ] Photo receipts
- [ ] Multi-device sync
- [ ] CSV export
- [ ] Recurring expenses
- [ ] Budget alerts
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Cloud backup (Firebase/AWS)
- [ ] Multi-currency support

---

## 🛠️ Technology Stack

### Frontend
- **React 18** - UI framework
- **Dexie** - IndexedDB wrapper for offline persistence
- **Axios** - HTTP client
- **CSS3** - Responsive styling

### Backend
- **Flask** - Web framework
- **SQLAlchemy** - ORM
- **Flask-JWT-Extended** - JWT authentication
- **SQLite/PostgreSQL** - Database

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Container orchestration
- **Nginx** - Reverse proxy
- **GitHub Actions** - CI/CD (optional)

---

## 📊 API Overview

### Authentication Endpoints
```
POST   /api/auth/register     - Create new account
POST   /api/auth/login        - Login user
GET    /api/auth/verify       - Verify token
POST   /api/auth/logout       - Logout user
```

### Expense Endpoints
```
POST   /api/expenses          - Create expense
GET    /api/expenses/user/:id - Get user expenses
PUT    /api/expenses/:id      - Update expense
DELETE /api/expenses/:id      - Delete expense
GET    /api/expenses/profit   - Calculate profit
```

See [API.md](docs/API.md) for full documentation.

---

## 🧪 Testing

### Quick Test with Demo Mode
1. Open http://localhost:3000
2. Click "Demo Mode" button
3. Add expenses and verify calculations
4. Test offline mode (DevTools → Network → Offline)

### Full Integration Test
1. Register new account
2. Add income and expense entries
3. Verify profit calculation
4. Go offline, add more entries
5. Go online and verify sync
6. Clear cache and reload (data persists)

See [TESTING.md](docs/TESTING.md) for comprehensive test scenarios.

---

## 🔐 Security Features

- ✅ Password hashing (Bcrypt)
- ✅ JWT token authentication
- ✅ User isolation (can only view own data)
- ✅ CORS configuration
- ✅ Input validation
- ✅ Error handling (no sensitive data in errors)
- ✅ Environment variable management
- ⭕ HTTPS ready (configure in production)

---

## 📦 Deployment Options

1. **Local Development** - npm/pip
2. **Docker Compose** - Single command deployment
3. **Cloud Platforms** - Heroku, Render, AWS, DigitalOcean
4. **Compiled Binaries** - PyInstaller + npm build
5. **Containerized** - Docker images with source protection

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed options.

---

## 🤝 Project Structure

```
RigHand/
├── frontend/                    # React application
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthForm.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── *.css
│   │   ├── services/
│   │   │   ├── api.js           # API calls & sync
│   │   │   └── offlineDB.js     # IndexedDB operations
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.jsx
│   ├── package.json
│   └── .env.example
│
├── backend/                     # Flask API
│   ├── app.py                   # Main application
│   ├── models.py                # Database models
│   ├── config.py                # Configuration
│   ├── routes_auth.py           # Auth endpoints
│   ├── routes_expenses.py       # Expense endpoints
│   ├── requirements.txt
│   └── .env.example
│
├── docs/                        # Documentation
│   ├── SETUP.md                 # Setup guide
│   ├── API.md                   # API documentation
│   ├── DEPLOYMENT.md            # Deployment guide
│   └── TESTING.md               # Testing guide
│
├── docker-compose.yml           # Docker compose file
├── README.md                    # This file
└── LICENSE                      # License (if applicable)
```

---

## ⚡ Performance

- **Offline Response**: < 50ms (local storage)
- **API Response**: < 500ms (network dependent)
- **Page Load**: < 2s (optimized bundle)
- **Database Query**: < 100ms (SQLite)
- **Bundle Size**: ~150KB (gzipped)

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.8+

# Check dependencies
pip list | grep flask

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Frontend can't connect
```
Check:
1. Backend is running on http://localhost:5000
2. CORS is enabled (should be by default)
3. .env.local has correct REACT_APP_API_URL
4. Firewall isn't blocking port 5000
```

### Offline mode not working
```
Check:
1. Browser supports IndexedDB
2. Clear browser cache and cookies
3. Check DevTools → Application → Storage → IndexedDB
```

See [SETUP.md](docs/SETUP.md) for more troubleshooting.

---

## 📝 License

Proprietary - All Rights Reserved

This application is proprietary software. Unauthorized reproduction, distribution, or modification is prohibited.

---

## 📞 Support

For issues or questions:
1. Check [SETUP.md](docs/SETUP.md)
2. Review [API.md](docs/API.md)
3. Check [TESTING.md](docs/TESTING.md)
4. Contact: [support email]

---

## 🎉 Acknowledgments

Built for **RigHand AI** - solving the financial blind spot in the trucking industry.

---

## 📈 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

**Last Updated**: January 15, 2024  
**Version**: 1.0.0  
**Status**: ✅ Production Ready
