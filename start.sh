#!/bin/bash
# RigHand AI Quick Start Script (macOS/Linux)

set -e

echo "🚚 RigHand AI - Quick Start"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}npm not found. Please install Node.js from https://nodejs.org${NC}"
    exit 1
fi

# Check if python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}python3 not found. Please install Python from https://www.python.org${NC}"
    exit 1
fi

echo "Starting Backend..."
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
if [ ! -d "venv/lib" ] || [ -z "$(pip list | grep Flask)" ]; then
    echo "Installing Python dependencies..."
    pip install -r requirements.txt > /dev/null 2>&1
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "Created .env file from template"
fi

# Start backend in background
python app.py > backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"
echo "  Backend URL: http://localhost:5000"

echo ""
echo "Starting Frontend..."
cd ../frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install > /dev/null 2>&1
fi

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    cp .env.example .env.local
    echo "Created .env.local file from template"
fi

# Start frontend in background
npm start > frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"
echo "  Frontend URL: http://localhost:3000"

echo ""
echo "============================"
echo -e "${GREEN}✓ Application Started!${NC}"
echo "============================"
echo ""
echo "📱 Open your browser:"
echo "   http://localhost:3000"
echo ""
echo "🎯 Click 'Demo Mode' to test without backend setup"
echo ""
echo "To stop the application:"
echo "   kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "Backend logs: backend/backend.log"
echo "Frontend logs: frontend/frontend.log"
echo ""

# Keep the script running
wait
