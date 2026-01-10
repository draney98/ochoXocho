/**
 * High Score Backend API Server
 * Simple Express server for storing and retrieving high scores
 * Deployed on Render.com with PostgreSQL for persistent storage
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const { initDatabase, isDatabaseAvailable } = require('./db');
const { saveScore, getLeaderboard, getScoreRank } = require('./scoresDb');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (adjust in production if needed)
app.use(cors());
app.use(express.json());

/**
 * POST /api/scores
 * Submits a new score
 * Body: { playerName: string, score: number, mode: 'easy' | 'hard', deviceId: string }
 */
app.post('/api/scores', async (req, res) => {
    try {
        const { playerName, score, mode, deviceId } = req.body;

        // Validation
        if (typeof score !== 'number' || score <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid score' });
        }

        if (mode !== 'easy' && mode !== 'hard') {
            return res.status(400).json({ success: false, error: 'Invalid mode' });
        }

        if (!deviceId || typeof deviceId !== 'string') {
            return res.status(400).json({ success: false, error: 'Invalid deviceId' });
        }

        // Create score entry
        const entry = {
            id: uuidv4(),
            playerName: (playerName && typeof playerName === 'string') ? playerName.trim().substring(0, 3).toUpperCase().padEnd(3, ' ') : '   ',
            score: Math.floor(score),
            mode: mode,
            deviceId: deviceId,
            timestamp: Date.now()
        };

        // Save to database
        const saved = await saveScore(entry);
        
        if (!saved) {
            console.warn('Score not saved to database, but returning success for client');
        }

        // Get the rank of the newly saved score
        const rank = await getScoreRank(mode, entry.id);

        res.json({
            success: true,
            rank: rank
        });
    } catch (error) {
        console.error('Error submitting score:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/leaderboard
 * Gets top scores for a mode
 * Query params: mode (easy/hard), period (today/week/ever), limit (default 10)
 */
app.get('/api/leaderboard', async (req, res) => {
    try {
        const mode = req.query.mode || 'easy';
        const period = req.query.period || 'ever'; // today, week, or ever
        const limit = parseInt(req.query.limit) || 10;

        if (mode !== 'easy' && mode !== 'hard') {
            return res.status(400).json({ success: false, error: 'Invalid mode' });
        }

        if (period !== 'today' && period !== 'week' && period !== 'ever') {
            return res.status(400).json({ success: false, error: 'Invalid period' });
        }

        const scores = await getLeaderboard(mode, period, limit);

        res.json({
            scores: scores
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        database: isDatabaseAvailable() ? 'connected' : 'disconnected'
    });
});

/**
 * Starts the server after initializing the database
 */
async function startServer() {
    // Initialize database connection
    await initDatabase();

    app.listen(PORT, () => {
        console.log(`High Score API server running on port ${PORT}`);
        if (!isDatabaseAvailable()) {
            console.warn('WARNING: Database is not available. Scores will not be persisted.');
        }
    });
}

// Start the server
startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
