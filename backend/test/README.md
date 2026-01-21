# Backend Tests

## Overview

Backend API tests verify that the Express server endpoints work correctly with various inputs and error conditions.

## Test Coverage

The backend should have tests for:

1. **POST /api/scores**
   - Valid score submission
   - Invalid score (negative, zero, non-number)
   - Invalid mode
   - Missing deviceId
   - Database error handling

2. **GET /api/leaderboard**
   - Valid requests for all modes (easy/hard) and periods (today/week/ever)
   - Default parameters
   - Invalid mode/period validation
   - Limit parameter validation and capping

3. **GET /health**
   - Health check response
   - Database connection status reporting

## Testing Framework

To add tests, install a testing framework:

```bash
cd backend
npm install --save-dev jest supertest
```

Then create `backend/test/server.test.js` using Jest and Supertest to test the Express endpoints.

## Manual Testing

For quick verification, test endpoints manually:

```bash
# Health check
curl http://localhost:3000/health

# Submit score
curl -X POST http://localhost:3000/api/scores \
  -H "Content-Type: application/json" \
  -d '{"playerName":"ABC","score":1000,"mode":"easy","deviceId":"test-id"}'

# Get leaderboard
curl http://localhost:3000/api/leaderboard?mode=easy&period=ever&limit=10
```

## Note

Currently, the backend does not have automated tests. The API endpoints are simple and well-validated, but adding automated tests would improve reliability and catch regressions.
