# Backend Setup Guide

The leaderboard requires the backend API server to be running. Here's how to set it up:

## Local Development

### Quick Start (Recommended)

**Start both frontend and backend with one command:**

```bash
npm run dev
```

This will start:
- Frontend dev server (usually on `http://localhost:5173`)
- Backend API server (on `http://localhost:3000`)

### Manual Setup (Alternative)

If you prefer to run them separately:

1. **Start the Backend Server** (in one terminal):
   ```bash
   npm run dev:backend
   ```
   The server will start on `http://localhost:3000`

2. **Start the Frontend Dev Server** (in another terminal):
   ```bash
   npm run dev:frontend
   ```

### Environment Configuration

Create a `.env` file in the project root (same directory as `package.json`):
```
VITE_API_BASE_URL=http://localhost:3000
```

This tells the frontend where to find the backend API. If you don't create this file, it will default to `/api` which won't work for local development.

## Testing

1. Open the game in your browser
2. Open the Settings panel
3. The leaderboard should load (may show "No scores yet" if empty)
4. Play a game and finish it - your score should be submitted
5. Check the leaderboard again - your score should appear

## Production Deployment

### Deploy Backend to Render.com

1. **Push code to GitHub** (if not already done)

2. **Create Web Service on Render.com**:
   - Go to [Render.com Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `ocho-xocho-api`
     - **Root Directory**: `backend`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
   - Click "Create Web Service"

3. **Copy the service URL** (e.g., `https://ocho-xocho-api.onrender.com`)

### Configure Frontend for Production

1. **In Render.com frontend service settings**, add environment variable:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://ocho-xocho-api.onrender.com` (your backend URL)

2. **Redeploy the frontend** to pick up the new environment variable

## Troubleshooting

### Leaderboard shows "Failed to load leaderboard"
- Check that backend server is running
- Check browser console for errors
- Verify `VITE_API_BASE_URL` is set correctly
- Check CORS settings (backend allows all origins by default)

### Scores not submitting
- Check browser console for errors
- Verify backend is running and accessible
- Check network tab in browser dev tools to see if requests are being made

### Backend not starting
- Make sure you're in the `backend` directory
- Run `npm install` if you haven't already
- Check that Node.js version is >= 18.0.0

