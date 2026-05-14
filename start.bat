@echo off
REM RigHand AI Quick Start Script (Windows)

echo.
echo 🚚 RigHand AI - Quick Start
echo ============================
echo.

REM Check if node is installed
where /q node
if errorlevel 1 (
    echo npm not found. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check if python is installed
where /q python
if errorlevel 1 (
    echo python not found. Please install Python from https://www.python.org
    pause
    exit /b 1
)

echo Starting Backend...
cd backend

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
if not exist "venv\Lib\site-packages\flask" (
    echo Installing Python dependencies...
    pip install -r requirements.txt > nul 2>&1
)

REM Create .env if it doesn't exist
if not exist ".env" (
    copy .env.example .env
    echo Created .env file from template
)

REM Start backend in new window
start "RigHand Backend" cmd /k "python app.py"
echo ✓ Backend started on http://localhost:5000

echo.
echo Starting Frontend...
cd ..\frontend

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install > nul 2>&1
)

REM Create .env.local if it doesn't exist
if not exist ".env.local" (
    copy .env.example .env.local
    echo Created .env.local file from template
)

REM Start frontend in new window
start "RigHand Frontend" cmd /k "npm start"
echo ✓ Frontend started on http://localhost:3000

echo.
echo ============================
echo ✓ Application Started!
echo ============================
echo.
echo 📱 Your browser should open automatically
echo    http://localhost:3000
echo.
echo 🎯 Click 'Demo Mode' to test without backend setup
echo.
echo To stop the application:
echo    Close the terminal windows
echo.
pause
