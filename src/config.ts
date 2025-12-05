/**
 * Centralized configuration for all game constants and settings
 * This file contains all hardcoded values that could be adjusted for game balance or behavior
 */

import { GameSettings } from './types';

/**
 * Board configuration
 */
export const BOARD_CONFIG = {
    cellCount: 8,
} as const;

/**
 * Gameplay configuration
 */
export const GAMEPLAY_CONFIG = {
    shapesPerTurn: 3,
    levelProgressPerLine: 6.6666667,
    levelProgressThreshold: 100,
    darknessReduction: 0.1,
    shapesPerValueTier: 10,
    pointsPerTier: 10,
} as const;

/**
 * Animation timing configuration (in milliseconds)
 */
export const ANIMATION_CONFIG = {
    lineClearMs: 300,
    gameOverFadeMs: 1000,
} as const;

/**
 * Game over animation configuration
 */
export const GAME_OVER_CONFIG = {
    popDelayMs: 80,
    popAnimationDurationMs: 400,
    restartDelayMs: 500,
} as const;

/**
 * Easy mode shape generation configuration
 */
export const EASY_MODE_CONFIG = {
    maxOptimisticAttempts: 10,
    fallbackAttempts: 20,
} as const;

/**
 * Sound configuration
 */
export const SOUND_CONFIG = {
    masterGain: 0.15,
    place: {
        frequency: 360,
        duration: 0.11,
        waveform: 'triangle' as const,
    },
    clear: {
        baseFrequency: 460,
        boardClearedFrequency: 620,
        frequencyStep: 35,
        baseDuration: 0.18,
        boardClearedDuration: 0.35,
        baseWaveform: 'square' as const,
        boardClearedWaveform: 'sawtooth' as const,
    },
    gameOver: {
        frequency: 220,
        duration: 0.45,
        waveform: 'sine' as const,
    },
    pop: {
        baseFrequency: 440,
        randomRange: 100,
        duration: 0.08,
        waveform: 'square' as const,
    },
} as const;

/**
 * Default game settings
 */
export const DEFAULT_SETTINGS: GameSettings = {
    showGrid: true,
    showGhostPreview: true,
    enableAnimations: true,
    soundEnabled: true,
    theme: 'classic',
    mode: 'easy',
};

/**
 * LocalStorage keys
 */
export const STORAGE_KEYS = {
    settings: 'ochoXocho_settings',
    highScores: {
        easy: 'ochoXocho_highScores_easy',
        hard: 'ochoXocho_highScores_hard',
    },
} as const;

/**
 * High score configuration
 */
export const HIGH_SCORE_CONFIG = {
    pollIntervalMs: 500,
    maxEntries: 100,
} as const;

/**
 * Responsive canvas configuration
 */
export const RESPONSIVE_CANVAS_LIMITS = {
    minHeight: 500,
    maxHeight: 900,
    verticalPadding: 300,
    horizontalPadding: 80,
} as const;

