# Troubleshooting High Scores / Leaderboard

## Issue: Leaderboard not loading or showing "Failed to load leaderboard"

### Step 1: Check if Backend is Running

1. Make sure you started the dev server with `npm run dev` (this starts both frontend and backend)
2. Check the terminal output - you should see:
   - `[frontend]` logs from Vite
   - `[backend]` logs showing "High Score API server running on port 3000"

### Step 2: Check Browser Console

1. Open browser DevTools (F12)
2. Go to Console tab
3. Open the Settings panel in the game
4. Look for logs starting with `[API]` or `[LEADERBOARD]`
5. Check for any error messages

### Step 3: Verify Environment Configuration

Create a `.env` file in the project root (same directory as `package.json`):
```
VITE_API_BASE_URL=http://localhost:3000
```

**Important**: After creating/updating `.env`, you must restart the dev server!

### Step 4: Test Backend Directly

Open in browser: `http://localhost:3000/health`

You should see: `{"status":"ok"}`

If this doesn't work, the backend isn't running.

### Step 5: Test API Endpoint

Open in browser: `http://localhost:3000/api/leaderboard?mode=easy&limit=50`

You should see: `{"scores":[]}` (empty array if no scores yet)

### Step 6: Check Network Tab

1. Open browser DevTools → Network tab
2. Open Settings panel in game
3. Look for a request to `/api/leaderboard` or `http://localhost:3000/api/leaderboard`
4. Check:
   - Status code (should be 200)
   - Response (should be JSON with `scores` array)
   - If it's red/failed, check the error message

### Common Issues

**Issue**: "Failed to fetch" or network error
- **Solution**: Backend isn't running. Make sure `npm run dev` started both servers.

**Issue**: 404 Not Found
- **Solution**: Check that `VITE_API_BASE_URL` in `.env` matches where backend is running (default: `http://localhost:3000`)

**Issue**: CORS error
- **Solution**: Backend should allow all origins by default. Check `backend/server.js` has `app.use(cors());`

**Issue**: Empty leaderboard but no error
- **Solution**: This is normal if no scores have been submitted yet. Play a game and finish it to submit a score.

### Still Not Working?

1. Check backend terminal for errors
2. Check browser console for detailed error messages
3. Verify `.env` file exists and has correct URL
4. Restart both servers (stop `npm run dev` and start again)

