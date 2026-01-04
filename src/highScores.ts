/**
 * High score tracking system with backend integration
 * Submits scores to backend API and maintains local fallback
 */

import { STORAGE_KEYS, HIGH_SCORE_CONFIG } from './config';
import { GameMode } from './types';
import { submitScore, getLeaderboard as fetchLeaderboard, LeaderboardPeriod } from './api';
import { getDeviceId } from './deviceId';

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
 * Records a new score by submitting it to the backend API
 * Also maintains local fallback for offline scenarios
 * @param score - The score to record
 * @param mode - The game mode ('easy' or 'hard')
 * @param playerName - The player's name (from settings)
 * @param deviceId - The device ID
 * @returns Promise resolving to the rank (1-based, or null if not in top 10 or error)
 */
export async function recordScore(
    score: number,
    mode: GameMode,
    playerName: string,
    deviceId: string
): Promise<number | null> {
    if (score <= 0) return null;

    // Submit to backend API and get rank
    try {
        const result = await submitScore(score, mode, playerName, deviceId);
        if (result.success && result.rank !== undefined && result.rank <= 10) {
            return result.rank;
        }
    } catch (error) {
        console.warn('Failed to submit score to backend:', error);
    }

    // Also maintain local fallback for offline scenarios
    const scores = getStoredScores(mode);
    scores.push({
        score,
        timestamp: Date.now(),
    });

    // Keep only the top configured number of scores to prevent storage bloat
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, HIGH_SCORE_CONFIG.maxEntries);
    saveScores(topScores, mode);
    
    // Check local rank (only if in top 10)
    const localRank = topScores.findIndex(s => s.score === score && s.timestamp === scores[scores.length - 1].timestamp) + 1;
    return (localRank > 0 && localRank <= 10) ? localRank : null;
}

/**
 * Gets the leaderboard from the backend API
 * @param mode - The game mode ('easy' or 'hard')
 * @param period - Time period filter ('today', 'week', or 'ever')
 * @returns Promise resolving to an array of leaderboard entries
 */
export async function getLeaderboard(mode: GameMode, period: LeaderboardPeriod = 'ever'): Promise<import('./types').LeaderboardEntry[]> {
    return fetchLeaderboard(mode, period, 50);
}

/**
 * Gets the highest score today for a specific mode
 */
export function getHighestToday(mode: string = 'easy'): number {
    const todayStart = getTodayStart();
    const scores = getStoredScores(mode);
    const todayScores = scores.filter(s => s.timestamp >= todayStart);
    if (todayScores.length === 0) return 0;
    return Math.max(...todayScores.map(s => s.score));
}

/**
 * Gets the highest score this week for a specific mode
 */
export function getHighestThisWeek(mode: string = 'easy'): number {
    const weekStart = getWeekStart();
    const scores = getStoredScores(mode);
    const weekScores = scores.filter(s => s.timestamp >= weekStart);
    if (weekScores.length === 0) return 0;
    return Math.max(...weekScores.map(s => s.score));
}

/**
 * Gets the highest score this year for a specific mode
 */
export function getHighestThisYear(mode: string = 'easy'): number {
    const yearStart = getYearStart();
    const scores = getStoredScores(mode);
    const yearScores = scores.filter(s => s.timestamp >= yearStart);
    if (yearScores.length === 0) return 0;
    return Math.max(...yearScores.map(s => s.score));
}

/**
 * Gets the highest score of all time for a specific mode
 */
export function getHighestEver(mode: string = 'easy'): number {
    const scores = getStoredScores(mode);
    if (scores.length === 0) return 0;
    return Math.max(...scores.map(s => s.score));
}

/**
 * Gets all high score records for display for a specific mode
 * @param mode - The game mode ('easy' or 'hard')
 */
export function getHighScores(mode: string = 'easy'): {
    today: number;
    week: number;
    ever: number;
} {
    return {
        today: getHighestToday(mode),
        week: getHighestThisWeek(mode),
        ever: getHighestEver(mode),
    };
}

