/**
 * API client for high score backend
 * Handles communication with the backend API for submitting scores and fetching leaderboards
 */

import { GameMode, LeaderboardEntry } from './types';
import { API_CONFIG, STORAGE_KEYS, DEFAULT_SETTINGS } from './config';

/**
 * Response from submitting a score
 */
interface SubmitScoreResponse {
    success: boolean;
    rank?: number;
}

/**
 * Request body for submitting a score
 */
interface SubmitScoreRequest {
    playerName: string;
    score: number;
    mode: 'easy' | 'hard';
    deviceId: string;
}

/**
 * Response from fetching leaderboard
 */
interface LeaderboardResponse {
    scores: LeaderboardEntry[];
}

/**
 * Submits a score to the backend API
 * @param score - The score to submit
 * @param mode - The game mode ('easy' or 'hard')
 * @param playerName - The player's name
 * @param deviceId - The device ID
 * @returns Promise resolving to the submission result
 */
export async function submitScore(
    score: number,
    mode: GameMode,
    playerName: string,
    deviceId: string
): Promise<SubmitScoreResponse> {
    try {
        const requestBody: SubmitScoreRequest = {
            playerName: (playerName || '   ').substring(0, 3).toUpperCase().padEnd(3, ' '),
            score,
            mode,
            deviceId,
        };

        const response = await fetch(`${API_CONFIG.baseUrl}/api/scores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: SubmitScoreResponse = await response.json();
        return data;
    } catch (error) {
        // Check devMode setting
        let devMode = DEFAULT_SETTINGS.devMode;
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.settings);
            if (stored) {
                const parsed = JSON.parse(stored);
                devMode = parsed.devMode ?? DEFAULT_SETTINGS.devMode;
            }
        } catch (e) {
            // Ignore localStorage errors
        }
        if (devMode) {
            console.warn('Failed to submit score to backend:', error);
        }
        // Return failure but don't throw - allow game to continue
        return { success: false };
    }
}

/**
 * Time period for leaderboard filtering
 */
export type LeaderboardPeriod = 'today' | 'week' | 'ever';

/**
 * Fetches the leaderboard from the backend API
 * @param mode - The game mode ('easy' or 'hard')
 * @param period - Time period filter ('today', 'week', or 'ever')
 * @param limit - Maximum number of scores to return (default: 50)
 * @returns Promise resolving to an array of leaderboard entries
 */
export async function getLeaderboard(
    mode: GameMode,
    period: LeaderboardPeriod = 'ever',
    limit: number = 10
): Promise<LeaderboardEntry[]> {
    const url = `${API_CONFIG.baseUrl}/api/leaderboard?mode=${mode}&period=${period}&limit=${limit}`;
    
    // Check devMode setting
    let devMode = DEFAULT_SETTINGS.devMode;
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.settings);
        if (stored) {
            const parsed = JSON.parse(stored);
            devMode = parsed.devMode ?? DEFAULT_SETTINGS.devMode;
        }
    } catch (e) {
        // Ignore localStorage errors
    }
    
    if (devMode) {
        console.log(`[API] Fetching leaderboard from: ${url}`);
    }
    
    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            if (devMode) {
                console.error(`[API] HTTP error! status: ${response.status}, body: ${errorText}`);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: LeaderboardResponse = await response.json();
        if (devMode) {
            console.log(`[API] Leaderboard response:`, data);
        }
        return data.scores || [];
    } catch (error) {
        if (devMode) {
            console.error('[API] Failed to fetch leaderboard from backend:', error);
            if (error instanceof TypeError && error.message.includes('fetch')) {
                console.error('[API] Network error - is the backend server running?');
                console.error('[API] Backend should be at:', API_CONFIG.baseUrl);
            }
        }
        // Return empty array on error - allow UI to show empty state
        return [];
    }
}

