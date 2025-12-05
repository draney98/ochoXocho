/**
 * Application entry point - initializes the game and sets up event handlers
 */

import { Game } from './game';
import { GameSettings, ThemeName, GameMode } from './types';
import { getHighScores, recordScore } from './highScores';
import {
    DEFAULT_SETTINGS,
    STORAGE_KEYS,
    HIGH_SCORE_CONFIG,
    RESPONSIVE_CANVAS_LIMITS,
} from './config';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

/**
 * Loads settings from localStorage, falling back to defaults
 */
function loadSettings(): GameSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.settings);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with defaults to handle any missing properties
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load settings from localStorage:', e);
    }
    return { ...DEFAULT_SETTINGS };
}

/**
 * Saves settings to localStorage
 */
function saveSettings(settings: GameSettings): void {
    try {
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch (e) {
        console.warn('Failed to save settings to localStorage:', e);
    }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const settingsState: GameSettings = loadSettings();
    applyTheme(settingsState.theme);

    // Make canvas responsive to window height
    setupResponsiveCanvas(canvas);

    // Initialize the game
    const game = new Game(canvas, settingsState);
    game.start();

    const updateHighScoreMode = setupHighScores(game, settingsState);
    setupSettingsControls(game, settingsState, updateHighScoreMode);

    // Restart button provides explicit control over resetting the board
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.addEventListener('click', () => {
            game.reset(true);
        });
    }
});

function setupSettingsControls(game: Game, initialSettings: GameSettings, updateHighScoreMode?: (mode: GameMode) => void): void {
    const panel = document.getElementById('settings-panel');
    const backdrop = document.getElementById('settings-backdrop');
    const openButton = document.getElementById('settings-button');
    const closeButton = document.getElementById('close-settings-button');

    const gridInput = document.getElementById('setting-show-grid') as HTMLInputElement | null;
    const ghostInput = document.getElementById('setting-show-ghost') as HTMLInputElement | null;
    const animationInput = document.getElementById('setting-enable-animations') as HTMLInputElement | null;
    const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement | null;
    const soundInput = document.getElementById('setting-enable-sound') as HTMLInputElement | null;
    const modeSelect = document.getElementById('setting-mode') as HTMLSelectElement | null;
    const pointValuesInput = document.getElementById('setting-show-point-values') as HTMLInputElement | null;

    // Sync inputs with initial settings so toggles reflect any future default changes
    if (gridInput) gridInput.checked = initialSettings.showGrid;
    if (ghostInput) ghostInput.checked = initialSettings.showGhostPreview;
    if (animationInput) animationInput.checked = initialSettings.enableAnimations;
    if (themeSelect) themeSelect.value = initialSettings.theme;
    if (soundInput) soundInput.checked = initialSettings.soundEnabled;
    if (modeSelect) modeSelect.value = initialSettings.mode;
    if (pointValuesInput) pointValuesInput.checked = initialSettings.showPointValues;

    const pushToGame = () => {
        const themeValue = (themeSelect?.value as ThemeName) ?? initialSettings.theme;
        const modeValue = (modeSelect?.value as GameMode) ?? initialSettings.mode;
        applyTheme(themeValue);
        updateModeDisplay(modeValue);
        
        // Update high score mode when it changes
        if (updateHighScoreMode) {
            updateHighScoreMode(modeValue);
        }

        const updatedSettings: GameSettings = {
            showGrid: gridInput?.checked ?? true,
            showGhostPreview: ghostInput?.checked ?? true,
            enableAnimations: animationInput?.checked ?? true,
            soundEnabled: soundInput?.checked ?? true,
            theme: themeValue,
            mode: modeValue,
            showPointValues: pointValuesInput?.checked ?? false,
        };
        game.updateSettings(updatedSettings);
        saveSettings(updatedSettings); // Save to localStorage
    };

    [gridInput, ghostInput, animationInput, soundInput, pointValuesInput].forEach(input => {
        input?.addEventListener('change', pushToGame);
    });

    themeSelect?.addEventListener('change', pushToGame);
    modeSelect?.addEventListener('change', pushToGame);
    
    // Initialize mode display
    updateModeDisplay(initialSettings.mode);

    const togglePanel = (open: boolean) => {
        panel?.classList.toggle('is-visible', open);
        backdrop?.classList.toggle('is-visible', open);
        panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
        backdrop?.setAttribute('aria-hidden', open ? 'false' : 'true');
    };

    openButton?.addEventListener('click', () => togglePanel(true));
    closeButton?.addEventListener('click', () => togglePanel(false));
    backdrop?.addEventListener('click', () => togglePanel(false));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            togglePanel(false);
        }
    });
}

function applyTheme(theme: ThemeName): void {
    document.body?.setAttribute('data-theme', theme);
}

function updateModeDisplay(mode: GameMode): void {
    const modeDisplay = document.getElementById('mode-display');
    if (modeDisplay) {
        modeDisplay.textContent = mode === 'easy' ? 'Easy' : 'Hard';
    }
}

function setupResponsiveCanvas(canvas: HTMLCanvasElement): void {
    const updateCanvasSize = () => {
        const availableHeight = window.innerHeight - RESPONSIVE_CANVAS_LIMITS.verticalPadding;
        const availableWidth = window.innerWidth - RESPONSIVE_CANVAS_LIMITS.horizontalPadding;
        
        // Calculate scale based on available height, maintaining aspect ratio
        const targetHeight = Math.min(
            Math.max(availableHeight, RESPONSIVE_CANVAS_LIMITS.minHeight),
            RESPONSIVE_CANVAS_LIMITS.maxHeight
        );
        const scale = targetHeight / CANVAS_HEIGHT;
        
        // Calculate width based on aspect ratio
        const targetWidth = CANVAS_WIDTH * scale;
        
        // Make sure it fits in available width too
        const widthScale = availableWidth / CANVAS_WIDTH;
        const finalScale = Math.min(scale, widthScale);
        
        // Apply scale to canvas, maintaining aspect ratio
        canvas.style.width = `${CANVAS_WIDTH * finalScale}px`;
        canvas.style.height = `${CANVAS_HEIGHT * finalScale}px`;
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
}

function setupHighScores(game: Game, initialSettings: GameSettings): (mode: GameMode) => void {
    let currentMode = initialSettings.mode;
    
    const updateHighScores = () => {
        // Get scores for the current mode
        const scores = getHighScores(currentMode);
        const todayEl = document.getElementById('high-score-today');
        const weekEl = document.getElementById('high-score-week');
        const yearEl = document.getElementById('high-score-year');
        
        if (todayEl) todayEl.textContent = scores.today.toString();
        if (weekEl) weekEl.textContent = scores.week.toString();
        if (yearEl) yearEl.textContent = scores.ever.toString();
    };

    // Update when mode changes
    const updateMode = (mode: GameMode) => {
        currentMode = mode;
        updateHighScores();
    };

    // Update on load
    updateHighScores();

    // Update periodically to catch score changes
    setInterval(updateHighScores, HIGH_SCORE_CONFIG.pollIntervalMs);
    
    // Return function to update mode
    return updateMode;
}

