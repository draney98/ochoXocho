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
    pulseThreshold: 60, // Blocks with value > this will pulse
    explosionThreshold: 90, // Blocks with value > this will explode
} as const;

/**
 * Animation timing configuration (in milliseconds)
 */
export const ANIMATION_CONFIG = {
    lineClearMs: 300,
    gameOverFadeMs: 1000,
    pulseCycleMs: 1000, // Duration of one pulse cycle
    explosionMs: 500, // Duration of explosion animation
    levelUpMs: 2000, // Duration of level up text animation
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
 * Volume multipliers normalize perceived loudness across different waveforms and durations
 * 
 * To use audio files instead of synthesized sounds:
 * 1. Place audio files in public/sounds/ directory
 * 2. Set the 'file' property to the filename (e.g., 'place.mp3')
 * 3. If file is set, it will be used; otherwise, synthesized sound will be used as fallback
 */
export const SOUND_CONFIG = {
    masterGain: 0.15,
    place: {
        frequency: 360,
        duration: 0.11,
        waveform: 'triangle' as const,
        volume: 1.0, // Triangle is moderate, no adjustment needed
        file: '434130__89o__place.wav', // Audio file for place sound
    },
    clear: {
        baseFrequency: 460,
        boardClearedFrequency: 620,
        frequencyStep: 35,
        baseDuration: 0.18,
        boardClearedDuration: 0.35,
        baseWaveform: 'square' as const,
        boardClearedWaveform: 'sawtooth' as const,
        baseVolume: 0.7, // Square is louder, reduce to match others
        boardClearedVolume: 0.8, // Sawtooth is loud, reduce slightly more
        baseFile: '268822__kwahmah_02__woodblock.wav', // Audio file for line clear sound
        boardClearedFile: '404764__owlstorm__retro-video-game-sfx-plop.wav', // Audio file for board cleared sound
    },
    gameOver: {
        frequency: 220,
        duration: 0.45,
        waveform: 'sine' as const,
        volume: 1.3, // Sine is quieter, especially with long duration, boost it
        file: '553521__newlocknew__pop-down-impact_1-2without-attack4lrsmltprcssng.wav', // Audio file for game over sound
    },
    pop: {
        baseFrequency: 440,
        randomRange: 100,
        duration: 0.08,
        waveform: 'square' as const,
        volume: 0.75, // Square is louder, reduce to match others
        file: '220180__gameaudio__click-pop.wav', // Audio file for pop sound
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
    showPointValues: true, // Dev setting: off by default
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
 * Optimized for mobile (360x640)
 */
export const RESPONSIVE_CANVAS_LIMITS = {
    minHeight: 400,
    maxHeight: 900,
    verticalPadding: 100, // Reduced for mobile
    horizontalPadding: 10, // Reduced for mobile
} as const;
