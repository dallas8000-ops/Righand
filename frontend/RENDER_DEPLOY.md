# RigHand AI Frontend (React)
# Render deployment instructions

1. Push all frontend code to GitHub.
2. Go to https://dashboard.render.com/ and click "New +" → "Web Service".
3. Connect your GitHub repo and select the frontend folder.
4. Set the environment:
   - Runtime: Node
   - Build Command: npm install && npm run build
   - Start Command: serve -s build
5. Add environment variables if needed (e.g., REACT_APP_API_URL).
6. Click "Create Web Service".
7. Wait for build and deployment to finish.
8. Test your frontend URL.

# Notes
- Make sure your frontend points to the correct backend API URL (update .env or config if needed).
- For best results, deploy backend first, then frontend.
