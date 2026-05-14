# RigHand AI Backend (Flask)
# Render deployment instructions

1. Make sure your code is pushed to GitHub.
2. Go to https://dashboard.render.com/ and log in.
3. Click "New +" → "Web Service".
4. Connect your GitHub repo and select the backend folder.
5. Set the environment:
   - Runtime: Python 3.x
   - Build Command: pip install -r requirements.txt
   - Start Command: gunicorn app:create_app()
6. Add environment variables (e.g., FLASK_ENV, SECRET_KEY, DATABASE_URL) as needed.
7. Click "Create Web Service".
8. Wait for build and deployment to finish.
9. Test your API endpoint (e.g., /health).

# Frontend (React)
- Deploy as a separate Web Service (Node) or serve from Flask (optional).
- For Node:
   - Build Command: npm install && npm run build
   - Start Command: serve -s build
- Or use Render's static site for the build folder.

# Notes
- For production, set proper CORS and secrets.
- You can connect frontend to backend via Render URLs.
