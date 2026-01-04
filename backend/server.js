/**
 * High Score Backend API Server
 * Simple Express server for storing and retrieving high scores
 * Deployed on Render.com
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (adjust in production if needed)
app.use(cors());
app.use(express.json());

// In-memory storage (for MVP - can upgrade to PostgreSQL later)
// Structure: { easy: [...], hard: [...] }
const scores = {
    easy: [],
    hard: []
};

/**
 * POST /api/scores
 * Submits a new score
 * Body: { playerName: string, score: number, mode: 'easy' | 'hard', deviceId: string }
 */
app.post('/api/scores', (req, res) => {
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

        // Add to storage
        scores[mode].push(entry);

        // Sort by score descending
        scores[mode].sort((a, b) => b.score - a.score);

        // Calculate rank (1-indexed)
        const rank = scores[mode].findIndex(s => s.id === entry.id) + 1;

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
 * Gets the start of today (midnight)
 */
function getTodayStart() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
}

/**
 * Gets the start of this week (Monday)
 */
function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    now.setDate(diff);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
}

/**
 * GET /api/leaderboard
 * Gets top scores for a mode
 * Query params: mode (easy/hard), period (today/week/ever), limit (default 50)
 */
app.get('/api/leaderboard', (req, res) => {
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

        // Filter scores by time period
        let filteredScores = scores[mode];
        
        if (period === 'today') {
            const todayStart = getTodayStart();
            filteredScores = scores[mode].filter(entry => entry.timestamp >= todayStart);
        } else if (period === 'week') {
            const weekStart = getWeekStart();
            filteredScores = scores[mode].filter(entry => entry.timestamp >= weekStart);
        }
        // period === 'ever' uses all scores (no filter)

        // Sort by score descending
        filteredScores = [...filteredScores].sort((a, b) => b.score - a.score);

        // Get top N scores
        const topScores = filteredScores
            .slice(0, Math.min(limit, 100)) // Cap at 100 for safety
            .map((entry, index) => ({
                rank: index + 1,
                playerName: entry.playerName,
                score: entry.score,
                timestamp: entry.timestamp,
                deviceId: entry.deviceId
            }));

        res.json({
            scores: topScores
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`High Score API server running on port ${PORT}`);
});

