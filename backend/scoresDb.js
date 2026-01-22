/**
 * Database operations for scores
 * Provides functions to load, save, and query scores from PostgreSQL
 */

const { getPool, isDatabaseAvailable } = require('./db');

/**
 * Loads all scores from the database grouped by mode
 * @returns {Promise<{easy: Array, hard: Array}>} Scores object with easy and hard arrays
 */
async function loadScores() {
    if (!isDatabaseAvailable()) {
        console.warn('Database not available, returning empty scores');
        return { easy: [], hard: [] };
    }

    try {
        const pool = getPool();
        const result = await pool.query(`
            SELECT id, player_name, score, mode, device_id, timestamp
            FROM scores
            ORDER BY score DESC
        `);

        const scores = { easy: [], hard: [] };
        for (const row of result.rows) {
            const entry = {
                id: row.id,
                playerName: row.player_name,
                score: row.score,
                mode: row.mode,
                deviceId: row.device_id,
                timestamp: parseInt(row.timestamp, 10)
            };
            if (row.mode === 'easy') {
                scores.easy.push(entry);
            } else if (row.mode === 'hard') {
                scores.hard.push(entry);
            }
        }

        console.log(`Loaded ${scores.easy.length} easy scores and ${scores.hard.length} hard scores from database`);
        return scores;
    } catch (error) {
        console.error('Error loading scores from database:', error.message);
        return { easy: [], hard: [] };
    }
}

/**
 * Saves a single score entry to the database
 * @param {Object} entry - Score entry to save
 * @param {string} entry.id - UUID of the entry
 * @param {string} entry.playerName - Player name (3 chars)
 * @param {number} entry.score - Score value
 * @param {string} entry.mode - Game mode ('easy' or 'hard')
 * @param {string} entry.deviceId - Device identifier
 * @param {number} entry.timestamp - Timestamp in milliseconds
 * @returns {Promise<boolean>} True if save was successful
 */
async function saveScore(entry) {
    if (!isDatabaseAvailable()) {
        console.warn('Database not available, score not saved');
        return false;
    }

    try {
        const pool = getPool();
        await pool.query(`
            INSERT INTO scores (id, player_name, score, mode, device_id, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [entry.id, entry.playerName, entry.score, entry.mode, entry.deviceId, entry.timestamp]);

        console.log(`Saved score ${entry.score} for mode ${entry.mode} to database`);
        return true;
    } catch (error) {
        console.error('Error saving score to database:', error.message);
        return false;
    }
}

/**
 * Gets the start of today (midnight in user's timezone)
 * @param {number} timezoneOffsetMinutes - Timezone offset in minutes from UTC (e.g., -300 for EST, 540 for JST)
 * @returns {number} UTC timestamp of today's start in user's timezone
 */
function getTodayStart(timezoneOffsetMinutes = 0) {
    const now = new Date();
    // Get current UTC time
    const utcNow = now.getTime();
    // Convert to user's local time by adding the offset
    const localTime = utcNow + timezoneOffsetMinutes * 60 * 1000;
    // Find midnight in user's local time (in UTC milliseconds)
    const localMidnight = Math.floor(localTime / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
    // Convert back to UTC timestamp
    return localMidnight - timezoneOffsetMinutes * 60 * 1000;
}

/**
 * Gets the start of the last 7 days (rolling 7 days from now in user's timezone)
 * @param {number} timezoneOffsetMinutes - Timezone offset in minutes from UTC (e.g., -300 for EST, 540 for JST)
 * @returns {number} UTC timestamp of 7 days ago in user's timezone
 */
function getWeekStart(timezoneOffsetMinutes = 0) {
    const todayStart = getTodayStart(timezoneOffsetMinutes);
    // Subtract 7 days (in milliseconds)
    return todayStart - (7 * 24 * 60 * 60 * 1000);
}

/**
 * Gets leaderboard scores from the database with filtering
 * @param {string} mode - Game mode ('easy' or 'hard')
 * @param {string} period - Time period ('today', 'week', or 'ever')
 * @param {number} limit - Maximum number of scores to return
 * @param {number} timezoneOffsetMinutes - Timezone offset in minutes from UTC (optional, defaults to 0/UTC)
 * @returns {Promise<Array>} Array of leaderboard entries
 */
async function getLeaderboard(mode, period, limit, timezoneOffsetMinutes = 0) {
    if (!isDatabaseAvailable()) {
        console.warn('Database not available, returning empty leaderboard');
        return [];
    }

    try {
        const pool = getPool();
        let query = `
            SELECT id, player_name, score, mode, device_id, timestamp
            FROM scores
            WHERE mode = $1
        `;
        const params = [mode];

        if (period === 'today') {
            const todayStart = getTodayStart(timezoneOffsetMinutes);
            query += ` AND timestamp >= $2`;
            params.push(todayStart);
        } else if (period === 'week') {
            const weekStart = getWeekStart(timezoneOffsetMinutes);
            query += ` AND timestamp >= $2`;
            params.push(weekStart);
        }
        // period === 'ever' uses all scores (no additional filter)

        // Ensure limit is a valid positive integer, cap at 100 for safety
        const safeLimit = Math.max(1, Math.min(Math.floor(limit || 10), 100));
        query += ` ORDER BY score DESC LIMIT $${params.length + 1}`;
        params.push(safeLimit);

        const result = await pool.query(query, params);

        // Defensive: ensure we never return more than the requested limit
        const limitedRows = result.rows.slice(0, safeLimit);

        return limitedRows.map((row, index) => ({
            rank: index + 1,
            playerName: row.player_name,
            score: row.score,
            timestamp: parseInt(row.timestamp, 10),
            deviceId: row.device_id
        }));
    } catch (error) {
        console.error('Error fetching leaderboard from database:', error.message);
        return [];
    }
}

/**
 * Gets the rank of a score in the database
 * @param {string} mode - Game mode ('easy' or 'hard')
 * @param {string} scoreId - UUID of the score entry
 * @returns {Promise<number>} 1-indexed rank of the score
 */
async function getScoreRank(mode, scoreId) {
    if (!isDatabaseAvailable()) {
        return 0;
    }

    try {
        const pool = getPool();
        const result = await pool.query(`
            SELECT COUNT(*) + 1 as rank
            FROM scores
            WHERE mode = $1 AND score > (
                SELECT score FROM scores WHERE id = $2
            )
        `, [mode, scoreId]);

        return parseInt(result.rows[0].rank, 10);
    } catch (error) {
        console.error('Error getting score rank:', error.message);
        return 0;
    }
}

/**
 * Gets the total count of scores for a mode and period
 * @param {string} mode - Game mode ('easy' or 'hard')
 * @param {string} period - Time period ('today', 'week', or 'ever')
 * @param {number} timezoneOffsetMinutes - Timezone offset in minutes from UTC (optional, defaults to 0/UTC)
 * @returns {Promise<number>} Total count of scores
 */
async function getScoreCount(mode, period, timezoneOffsetMinutes = 0) {
    if (!isDatabaseAvailable()) {
        return 0;
    }

    try {
        const pool = getPool();
        let query = `
            SELECT COUNT(*) as total
            FROM scores
            WHERE mode = $1
        `;
        const params = [mode];

        if (period === 'today') {
            const todayStart = getTodayStart(timezoneOffsetMinutes);
            query += ` AND timestamp >= $2`;
            params.push(todayStart);
        } else if (period === 'week') {
            const weekStart = getWeekStart(timezoneOffsetMinutes);
            query += ` AND timestamp >= $2`;
            params.push(weekStart);
        }
        // period === 'ever' uses all scores (no additional filter)

        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total, 10);
    } catch (error) {
        console.error('Error getting score count:', error.message);
        return 0;
    }
}

/**
 * Gets the rank of a specific score value in the database
 * @param {string} mode - Game mode ('easy' or 'hard')
 * @param {number} score - The score value to rank
 * @param {string} period - Time period ('today', 'week', or 'ever')
 * @param {number} timezoneOffsetMinutes - Timezone offset in minutes from UTC (optional, defaults to 0/UTC)
 * @returns {Promise<number>} 1-indexed rank of the score
 */
async function getScoreRankByValue(mode, score, period, timezoneOffsetMinutes = 0) {
    if (!isDatabaseAvailable()) {
        return 0;
    }

    try {
        const pool = getPool();
        let query = `
            SELECT COUNT(*) + 1 as rank
            FROM scores
            WHERE mode = $1 AND score > $2
        `;
        const params = [mode, score];

        if (period === 'today') {
            const todayStart = getTodayStart(timezoneOffsetMinutes);
            query += ` AND timestamp >= $3`;
            params.push(todayStart);
        } else if (period === 'week') {
            const weekStart = getWeekStart(timezoneOffsetMinutes);
            query += ` AND timestamp >= $3`;
            params.push(weekStart);
        }
        // period === 'ever' uses all scores (no additional filter)

        const result = await pool.query(query, params);
        return parseInt(result.rows[0].rank, 10);
    } catch (error) {
        console.error('Error getting score rank by value:', error.message);
        return 0;
    }
}

module.exports = {
    loadScores,
    saveScore,
    getLeaderboard,
    getScoreRank,
    getScoreCount,
    getScoreRankByValue
};

