# Viewing Logs

This application doesn't write log files - all logging goes to the console/terminal. Here's where to find the logs:

## Frontend Logs (Browser Console)

1. **Open Browser DevTools**:
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Or `Cmd+Option+I` (Mac)
   - Or right-click → "Inspect"

2. **Go to Console Tab**

3. **Look for logs with these prefixes**:
   - `[API]` - API calls (fetching leaderboard, submitting scores)
   - `[LEADERBOARD]` - Leaderboard loading
   - `[PLACE]` - Shape placement
   - `[CLEAR]` - Line clearing
   - `[RESET]` - Game reset

4. **Filter logs**: Use the filter box in console to search for specific prefixes like `[API]` or `[LEADERBOARD]`

## Backend Logs (Terminal)

When you run `npm run dev`, you'll see logs in your terminal:

- **Backend logs** are prefixed with `[backend]` (if using concurrently)
- Look for:
  - `High Score API server running on port 3000` - Server started
  - `Error submitting score:` - Score submission errors
  - `Error fetching leaderboard:` - Leaderboard fetch errors

## Network Logs (Browser DevTools)

To see API requests:

1. Open DevTools → **Network** tab
2. Open Settings panel in game (triggers leaderboard load)
3. Look for requests to:
   - `/api/leaderboard` or `http://localhost:3000/api/leaderboard`
   - `/api/scores` or `http://localhost:3000/api/scores`
4. Click on a request to see:
   - Request URL
   - Request headers
   - Response status
   - Response body

## Common Log Messages

### When Leaderboard Loads Successfully:
```
[API] Fetching leaderboard from: http://localhost:3000/api/leaderboard?mode=easy&limit=50
[API] API_CONFIG.baseUrl: http://localhost:3000
[API] Leaderboard response: {scores: [...]}
[LEADERBOARD] Loading leaderboard for mode: easy
[LEADERBOARD] Received X entries
```

### When There's an Error:
```
[API] Failed to fetch leaderboard from backend: [error message]
Failed to load leaderboard: [error message]
```

### Network Errors:
- `Failed to fetch` - Backend not running or wrong URL
- `404 Not Found` - Wrong endpoint or backend not running
- `CORS error` - Backend CORS not configured

## Tips

- **Clear console**: Click the clear button (🚫) or press `Ctrl+L`
- **Save console output**: Right-click in console → "Save as..."
- **Filter errors**: Click the error icon (red circle) to show only errors
- **Preserve log**: Check "Preserve log" to keep logs when page refreshes

