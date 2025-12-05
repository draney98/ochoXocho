/**
 * High score tracking system with daily, weekly, and yearly records
 */

import { STORAGE_KEYS, HIGH_SCORE_CONFIG } from './config';

interface HighScoreEntry {
    score: number;
    timestamp: number;
}

/**
 * Gets all stored high scores from localStorage for a specific mode
 */
function getStoredScores(mode: string = 'easy'): HighScoreEntry[] {
    try {
        const key = mode === 'hard' ? STORAGE_KEYS.highScores.hard : STORAGE_KEYS.highScores.easy;
        const stored = localStorage.getItem(key);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

/**
 * Saves high scores to localStorage for a specific mode
 */
function saveScores(scores: HighScoreEntry[], mode: string = 'easy'): void {
    try {
        const key = mode === 'hard' ? STORAGE_KEYS.highScores.hard : STORAGE_KEYS.highScores.easy;
        localStorage.setItem(key, JSON.stringify(scores));
    } catch {
        // Ignore storage errors
    }
}

/**
 * Gets the start of today (midnight)
 */
function getTodayStart(): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
}

/**
 * Gets the start of this week (Monday)
 */
function getWeekStart(): number {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    now.setDate(diff);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
}

/**
 * Gets the start of this year (January 1st)
 */
function getYearStart(): number {
    const now = new Date();
    now.setMonth(0, 1);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
}

/**
 * Records a new score if it's a high score
 * @param score - The score to record
 * @param mode - The game mode ('easy' or 'hard')
 */
export function recordScore(score: number, mode: string = 'easy'): void {
    if (score <= 0) return;

    const scores = getStoredScores(mode);
    scores.push({
        score,
        timestamp: Date.now(),
    });

    // Keep only the top configured number of scores to prevent storage bloat
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, HIGH_SCORE_CONFIG.maxEntries);
    saveScores(topScores, mode);
}

/**
 * Gets the highest score today
 */
export function getHighestToday(): number {
    const todayStart = getTodayStart();
    const scores = getStoredScores();
    const todayScores = scores.filter(s => s.timestamp >= todayStart);
    if (todayScores.length === 0) return 0;
    return Math.max(...todayScores.map(s => s.score));
}

/**
 * Gets the highest score this week
 */
export function getHighestThisWeek(): number {
    const weekStart = getWeekStart();
    const scores = getStoredScores();
    const weekScores = scores.filter(s => s.timestamp >= weekStart);
    if (weekScores.length === 0) return 0;
    return Math.max(...weekScores.map(s => s.score));
}

/**
 * Gets the highest score this year
 */
export function getHighestThisYear(): number {
    const yearStart = getYearStart();
    const scores = getStoredScores();
    const yearScores = scores.filter(s => s.timestamp >= yearStart);
    if (yearScores.length === 0) return 0;
    return Math.max(...yearScores.map(s => s.score));
}

/**
 * Gets the highest score of all time
 */
export function getHighestEver(): number {
    const scores = getStoredScores();
    if (scores.length === 0) return 0;
    return Math.max(...scores.map(s => s.score));
}

/**
 * Gets all high score records for display
 */
export function getHighScores(): {
    today: number;
    week: number;
    ever: number;
} {
    return {
        today: getHighestToday(),
        week: getHighestThisWeek(),
        ever: getHighestEver(),
    };
}

