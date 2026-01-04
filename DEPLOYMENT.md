# Deployment Guide for Render.com

This guide explains how to deploy both the frontend and backend to Render.com so the leaderboard works correctly.

## Overview

The application consists of two separate services:
1. **Backend API** - Node.js/Express server for high scores (deployed as a Web Service)
2. **Frontend** - Static site built with Vite (deployed as a Static Site)

## Step 1: Deploy the Backend API

1. **Push your code to GitHub** (if not already done)

2. **Create a new Web Service on Render.com**:
   - Go to [Render.com Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the repository containing this project

3. **Configure the Backend Service**:
   - **Name**: `ocho-xocho-api` (or your preferred name)
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free tier is fine for MVP

4. **Add Environment Variables** (optional, defaults work):
   - `NODE_ENV`: `production`
   - `PORT`: `3000` (Render will override this automatically)

5. **Deploy**: Click "Create Web Service"

6. **Note the Service URL**: After deployment, Render will provide a URL like:
   ```
   https://ocho-xocho-api.onrender.com
   ```
   **Save this URL** - you'll need it for the frontend configuration.

## Step 2: Deploy the Frontend

1. **Create a new Static Site on Render.com**:
   - Go to [Render.com Dashboard](https://dashboard.render.com)
   - Click "New +" → "Static Site"
   - Connect the same GitHub repository

2. **Configure the Frontend Service**:
   - **Name**: `ocho-xocho` (or your preferred name)
   - **Root Directory**: (leave empty - root of repo)
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

3. **Add Environment Variable** (CRITICAL):
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: The backend service URL from Step 1 (e.g., `https://ocho-xocho-api.onrender.com`)
   - **Important**: Do NOT include a trailing slash

4. **Deploy**: Click "Create Static Site"

## Step 3: Verify Deployment

1. **Test the Backend**:
   - Visit `https://ocho-xocho-api.onrender.com/health`
   - You should see: `{"status":"ok"}`

2. **Test the Frontend**:
   - Visit your frontend URL (e.g., `https://ocho-xocho.onrender.com`)
   - Play a game and check if scores are submitted
   - Open the leaderboard and verify it loads scores

3. **Check Browser Console**:
   - Open browser DevTools (F12)
   - Check the Console tab for any API errors
   - Look for `[API]` log messages to see API calls

## Troubleshooting

### Leaderboard Not Loading

1. **Check Environment Variable**:
   - In Render dashboard, go to your Static Site
   - Check "Environment" tab
   - Verify `VITE_API_BASE_URL` is set correctly (no trailing slash)
   - Rebuild the site after changing environment variables

2. **Check Backend Status**:
   - Visit `https://your-backend-url.onrender.com/health`
   - If it doesn't respond, check backend logs in Render dashboard

3. **Check CORS**:
   - The backend has CORS enabled for all origins
   - If you see CORS errors, verify the backend is running

4. **Check Browser Console**:
   - Look for network errors in DevTools → Network tab
   - Check if API calls are going to the correct URL

### Backend Not Starting

1. **Check Logs**:
   - In Render dashboard, go to your Web Service
   - Check "Logs" tab for error messages

2. **Verify Dependencies**:
   - Ensure `backend/package.json` has all required dependencies
   - Check that `npm install` completes successfully

3. **Check Port**:
   - Render automatically sets `PORT` environment variable
   - The backend uses `process.env.PORT || 3000`

### Frontend Build Failing

1. **Check Build Logs**:
   - In Render dashboard, go to your Static Site
   - Check "Logs" tab for build errors

2. **Verify Node Version**:
   - Render uses Node 18+ by default
   - Check `package.json` for any version requirements

## Alternative: Using render.yaml

If you prefer to use the `render.yaml` configuration files:

1. **Backend**: The `backend/render.yaml` file is already configured
   - Render should auto-detect it when deploying from the `backend` directory

2. **Frontend**: The root `render.yaml` can be used, but you'll still need to:
   - Set the `VITE_API_BASE_URL` environment variable manually in Render dashboard
   - Or modify the build command to include it

## Environment Variables Summary

### Backend (Web Service)
- `NODE_ENV`: `production` (optional)
- `PORT`: Automatically set by Render

### Frontend (Static Site)
- `VITE_API_BASE_URL`: **Required** - Full URL of backend service (e.g., `https://ocho-xocho-api.onrender.com`)

## Notes

- **Free Tier Limitations**: Render's free tier spins down services after 15 minutes of inactivity. The first request after spin-down may be slow (~30 seconds).
- **Data Persistence**: The backend uses in-memory storage. Scores will be lost when the service restarts. For production, consider upgrading to PostgreSQL.
- **HTTPS**: Render provides HTTPS automatically for all services.

