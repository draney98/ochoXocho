# OchoXocho Backend API

High score backend server for the OchoXocho game.

## Local Development

1. Install dependencies:
```bash
cd backend
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000` by default.

## Frontend Configuration

For local development, you need to configure the frontend to point to the backend:

1. Create a `.env` file in the project root (not in `backend/`):
```
VITE_API_BASE_URL=http://localhost:3000
```

2. Restart the Vite dev server if it's running.

## Production Deployment

### Deploy to Render.com

1. Push the code to GitHub (or your Git provider)

2. In Render.com dashboard:
   - Click "New +" → "Web Service"
   - Connect your repository
   - Set the following:
     - **Name**: `ocho-xocho-api` (or your preferred name)
     - **Root Directory**: `backend`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`

3. After deployment, copy the service URL (e.g., `https://ocho-xocho-api.onrender.com`)

4. Update frontend environment variable:
   - In your frontend build settings on Render.com, add:
     - **Key**: `VITE_API_BASE_URL`
     - **Value**: `https://ocho-xocho-api.onrender.com` (your backend URL)

## API Endpoints

- `POST /api/scores` - Submit a score
- `GET /api/leaderboard?mode=easy&limit=50` - Get leaderboard
- `GET /health` - Health check

## Notes

- Uses PostgreSQL for persistent storage (scores survive service restarts)
- Database table is created automatically on first run
- Set `DATABASE_URL` environment variable to connect to PostgreSQL

## Local Development with PostgreSQL

For local development with a database:

1. Install PostgreSQL locally or use a cloud instance
2. Create a `.env` file in the `backend/` directory:
```
DATABASE_URL=postgresql://user:password@localhost:5432/ochoxocho
```

3. Start the server - it will create the `scores` table automatically

