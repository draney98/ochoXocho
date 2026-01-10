/**
 * Database connection management module
 * Handles PostgreSQL connection pool initialization and management
 */

require('dotenv').config();
const { Pool } = require('pg');

let pool = null;

/**
 * Initializes the PostgreSQL connection pool and creates the scores table if needed
 * @returns {Promise<void>}
 */
async function initDatabase() {
    if (!process.env.DATABASE_URL) {
        console.warn('DATABASE_URL not set - database features will be unavailable');
        return;
    }

    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        // Test connection
        const client = await pool.connect();
        console.log('Connected to PostgreSQL database');

        // Create scores table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS scores (
                id UUID PRIMARY KEY,
                player_name VARCHAR(3) NOT NULL,
                score INTEGER NOT NULL,
                mode VARCHAR(10) NOT NULL,
                device_id VARCHAR(255) NOT NULL,
                timestamp BIGINT NOT NULL
            )
        `);

        // Create index on mode and score for leaderboard queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_scores_mode_score ON scores (mode, score DESC)
        `);

        // Create index on timestamp for time-based filtering
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_scores_timestamp ON scores (timestamp)
        `);

        console.log('Database initialized successfully');
        client.release();
    } catch (error) {
        console.error('Failed to initialize database:', error.message);
        pool = null;
    }
}

/**
 * Gets the current database pool
 * @returns {Pool|null} The PostgreSQL pool or null if not initialized
 */
function getPool() {
    return pool;
}

/**
 * Closes the database connection pool
 * @returns {Promise<void>}
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('Database connection pool closed');
    }
}

/**
 * Checks if the database is available
 * @returns {boolean} True if database is connected
 */
function isDatabaseAvailable() {
    return pool !== null;
}

module.exports = {
    initDatabase,
    getPool,
    closePool,
    isDatabaseAvailable
};

