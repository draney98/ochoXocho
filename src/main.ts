/**
 * Application entry point - initializes the game and sets up event handlers
 */

// IMPORTANT: Import this FIRST to suppress PixiJS warnings before pixi.js loads
import './suppressPixiWarnings';

import { Game } from './game';
import { assetLoader } from './assetLoader';
import { GameSettings, ThemeName, GameMode, LeaderboardEntry } from './types';
import { getHighScores, getLeaderboard } from './highScores';
import { LeaderboardPeriod } from './api';
import {
    DEFAULT_SETTINGS,
    STORAGE_KEYS,
    HIGH_SCORE_CONFIG,
    RESPONSIVE_CANVAS_LIMITS,
    GAMEPLAY_CONFIG,
} from './config';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { waitForFonts } from './fontConfig';
import { devLogger } from './devLogger';
import { VERSION } from './version';

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

/**
 * Exports loadSettings and saveSettings for use in other modules
 */
export { loadSettings, saveSettings };

/**
 * Calculates the number of lines needed to complete a level
 */
function getLinesPerLevel(): number {
    return Math.ceil(GAMEPLAY_CONFIG.levelProgressThreshold / GAMEPLAY_CONFIG.levelProgressPerLine);
}

/**
 * Creates progress boxes dynamically based on lines per level
 */
function setupProgressBoxes(): void {
    const container = document.getElementById('level-progress-container');
    if (!container) return;

    // Clear existing boxes
    container.innerHTML = '';

    // Calculate number of boxes needed (one per line to complete level)
    const linesPerLevel = getLinesPerLevel();

    // Create boxes
    for (let i = 0; i < linesPerLevel; i++) {
        const box = document.createElement('div');
        box.className = 'progress-box';
        box.setAttribute('data-index', i.toString());
        container.appendChild(box);
    }
}

/**
 * Sets a CSS custom property --vh that accurately reflects the visible viewport height.
 * This is more reliable than 100vh/100dvh on iOS Safari where the browser chrome
 * (address bar, toolbar) affects the actual visible area.
 */
function setViewportHeight(): void {
    // Use window.innerHeight as the most reliable source
    let vh = window.innerHeight;
    
    // On Safari, also check visualViewport and use the smaller value
    if (window.visualViewport) {
        vh = Math.min(vh, window.visualViewport.height);
    }
    
    // Set custom property as 1% of viewport height (like vh unit)
    document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
}

// Set viewport height immediately (before DOMContentLoaded)
setViewportHeight();

// Update on resize and orientation change
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);

// Also listen to visualViewport changes for Safari
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setViewportHeight);
}

// Global error handlers to prevent unexpected restarts on mobile
window.addEventListener('error', (event) => {
    const message = String(event.message || event.error || '');
    
    // Suppress harmless ResizeObserver loop warnings
    // These occur when ResizeObserver callbacks cause additional layout changes
    if (message.includes('ResizeObserver loop')) {
        event.preventDefault();
        return false;
    }
    
    console.error('[GLOBAL ERROR]', event.error || event.message, event.filename, event.lineno);
    // Prevent default error handling that might cause page reload
    event.preventDefault();
    return false;
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
    // Prevent default error handling that might cause page reload
    event.preventDefault();
});

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
    // Recalculate viewport height after DOM is ready (Safari may have stabilized)
    setViewportHeight();
    
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const settingsState: GameSettings = loadSettings();
    applyTheme(settingsState.theme);

    // Wait for fonts to be ready before rendering any text
    // This prevents FOIT (Flash of Invisible Text) and ensures consistent rendering
    await waitForFonts(2000, settingsState.devMode);

    // Create progress boxes dynamically based on lines per level
    setupProgressBoxes();

    // Make canvas responsive to window height
    setupResponsiveCanvas(canvas);

    // Sync UI element widths with canvas width
    setupResponsiveUI(canvas);

    // Load PixiJS assets before initializing game
    try {
        await assetLoader.load();
    } catch (error) {
        console.error('Failed to load assets:', error);
        // Continue anyway - assets will be missing but game can still initialize
    }

    // Initialize the game
    const game = new Game(canvas, settingsState);
    
    // Initialize PixiJS renderer after game is created
    try {
        await game.getRenderer().initialize(canvas);
    } catch (error) {
        // Suppress "CanvasRenderer is not yet implemented" errors - WebGL fallback works
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('CanvasRenderer is not yet implemented')) {
            console.error('Failed to initialize PixiJS renderer:', error);
        }
        // If initialization actually failed, the renderer won't work, but we continue anyway
    }
    
    game.start();
    
    // Set up player name prompt callback
    game.setPlayerNamePromptCallback(() => showPlayerNamePrompt());
    // Wire up game over dialog OK button (click + touchend for mobile)
    const gameOverDialogOk = document.getElementById('game-over-dialog-ok');
    if (gameOverDialogOk) {
        let gameOverOkLastHandled = 0;
        const handleGameOverOk = (e: Event) => {
            const now = Date.now();
            if (now - gameOverOkLastHandled < 800) return; // Prevent double-fire (click + touchend)
            gameOverOkLastHandled = now;
            if (e.type === 'touchend' && e.cancelable) {
                e.preventDefault();
            }
            game.proceedWithGameOver();
        };
        gameOverDialogOk.addEventListener('click', handleGameOverOk);
        gameOverDialogOk.addEventListener('touchend', handleGameOverOk, { passive: false });
    }

    const updateHighScoreMode = setupHighScores(game, settingsState);
    const { updateModeSelectState } = setupSettingsControls(game, settingsState, updateHighScoreMode);
    setupLeaderboardPopup(settingsState);

    // Restart button: show custom confirm dialog (works everywhere, including when native confirm is blocked)
    const restartButton = document.getElementById('restart-button');
    const restartBackdrop = document.getElementById('restart-confirm-backdrop');
    const restartDialog = document.getElementById('restart-confirm-dialog');
    const restartConfirmCancel = document.getElementById('restart-confirm-cancel');
    const restartConfirmRestart = document.getElementById('restart-confirm-restart');

    const showRestartConfirm = (): void => {
        if (!restartBackdrop || !restartDialog) return;
        restartBackdrop.setAttribute('aria-hidden', 'false');
        restartDialog.setAttribute('aria-hidden', 'false');
        restartBackdrop.style.display = 'block';
        restartDialog.style.display = 'block';
    };

    const hideRestartConfirm = (): void => {
        if (!restartBackdrop || !restartDialog) return;
        restartBackdrop.setAttribute('aria-hidden', 'true');
        restartDialog.setAttribute('aria-hidden', 'true');
        restartBackdrop.style.display = 'none';
        restartDialog.style.display = 'none';
    };

    const doRestart = (): void => {
        hideRestartConfirm();
        game.reset(true);
        updateModeSelectState();
    };

    if (restartButton) {
        restartButton.addEventListener('click', (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            showRestartConfirm();
        });
    }
    // Handlers with 800ms debounce per button (same as game-over OK) to prevent double-fire from click + touchend on mobile
    let restartCancelLastHandled = 0;
    let restartConfirmLastHandled = 0;
    const handleRestartCancel = (e: Event) => {
        const now = Date.now();
        if (now - restartCancelLastHandled < 800) return;
        restartCancelLastHandled = now;
        if (e.type === 'touchend' && e.cancelable) e.preventDefault();
        hideRestartConfirm();
    };
    const handleRestartConfirm = (e: Event) => {
        const now = Date.now();
        if (now - restartConfirmLastHandled < 800) return;
        restartConfirmLastHandled = now;
        if (e.type === 'touchend' && e.cancelable) e.preventDefault();
        doRestart();
    };
    restartConfirmCancel?.addEventListener('click', handleRestartCancel);
    restartConfirmRestart?.addEventListener('click', handleRestartConfirm);
    restartBackdrop?.addEventListener('click', () => hideRestartConfirm());
    restartDialog?.addEventListener('click', (e: Event) => e.stopPropagation());
    restartConfirmCancel?.addEventListener('touchend', handleRestartCancel, { passive: false });
    restartConfirmRestart?.addEventListener('touchend', handleRestartConfirm, { passive: false });

    // Auto-place button automatically places all three pieces
    const autoPlaceButton = document.getElementById('auto-place-button') as HTMLButtonElement | null;
    if (autoPlaceButton) {
        // Set up callback to enable/disable button based on autoplace state
        game.setAutoPlaceStateChangeCallback((isPlacing: boolean) => {
            if (autoPlaceButton) {
                autoPlaceButton.disabled = isPlacing;
                autoPlaceButton.style.opacity = isPlacing ? '0.5' : '1';
                autoPlaceButton.style.cursor = isPlacing ? 'not-allowed' : 'pointer';
            }
        });

        autoPlaceButton.addEventListener('click', () => {
            // Prevent double-clicking - check if already placing
            if (autoPlaceButton.disabled) {
                return;
            }
            
            // Double-check setting before executing (in case setting changed mid-game)
            const currentSettings = loadSettings();
            if (currentSettings.autoplaceEnabled) {
                game.autoPlacePieces();
            }
        });
    }

});

function setupSettingsControls(game: Game, initialSettings: GameSettings, updateHighScoreMode?: (mode: GameMode) => void): { updateModeSelectState: () => void; updateAutoplaceButtonVisibility: (enabled: boolean) => void } {
    const panel = document.getElementById('settings-panel');
    const backdrop = document.getElementById('settings-backdrop');
    const openButton = document.getElementById('settings-button');
    const closeButton = document.getElementById('close-settings-button');

    const gridInput = document.getElementById('setting-show-grid') as HTMLInputElement | null;
    const animationInput = document.getElementById('setting-enable-animations') as HTMLInputElement | null;
    const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement | null;
    const soundInput = document.getElementById('setting-enable-sound') as HTMLInputElement | null;
    const modeSelect = document.getElementById('setting-mode') as HTMLSelectElement | null;
    const pointValuesInput = document.getElementById('setting-show-point-values') as HTMLInputElement | null;
    const autoplaceInput = document.getElementById('setting-autoplace-enabled') as HTMLInputElement | null;
    const showGameOverDialogInput = document.getElementById('setting-show-game-over-dialog') as HTMLInputElement | null;
    const playerNameInput = document.getElementById('setting-player-name') as HTMLInputElement | null;
    const devModeInput = document.getElementById('setting-dev-mode') as HTMLInputElement | null;
    const controlZoneHeightInput = document.getElementById('setting-control-zone-height') as HTMLInputElement | null;
    const controlZoneMaxScaleInput = document.getElementById('setting-control-zone-max-scale') as HTMLInputElement | null;
    const controlZoneMinScaleInput = document.getElementById('setting-control-zone-min-scale') as HTMLInputElement | null;
    const controlZoneHeightValue = document.getElementById('control-zone-height-value');
    const controlZoneMaxScaleValue = document.getElementById('control-zone-max-scale-value');
    const controlZoneMinScaleValue = document.getElementById('control-zone-min-scale-value');

    // Sync inputs with initial settings so toggles reflect any future default changes
    if (gridInput) gridInput.checked = initialSettings.showGrid;
    // Ghost preview is always on - no longer a user setting
    if (animationInput) animationInput.checked = initialSettings.enableAnimations;
    if (themeSelect) themeSelect.value = initialSettings.theme;
    if (soundInput) soundInput.checked = initialSettings.soundEnabled;
    if (modeSelect) modeSelect.value = initialSettings.mode;
    if (pointValuesInput) pointValuesInput.checked = initialSettings.showPointValues;
    if (autoplaceInput) autoplaceInput.checked = initialSettings.autoplaceEnabled;
    if (devModeInput) devModeInput.checked = initialSettings.devMode ?? false;
    
    // Initialize dev logger and download button
    const downloadLogRow = document.getElementById('download-log-row');
    const downloadLogBtn = document.getElementById('download-dev-log-btn');
    
    const updateDevLogVisibility = (enabled: boolean) => {
        if (downloadLogRow) {
            downloadLogRow.style.display = enabled ? 'flex' : 'none';
        }
        if (enabled) {
            devLogger.enable();
        } else {
            devLogger.disable();
        }
    };
    
    // Initialize dev logger based on initial setting
    updateDevLogVisibility(initialSettings.devMode ?? false);
    
    // Handle download button click
    downloadLogBtn?.addEventListener('click', () => {
        devLogger.downloadLogs();
    });
    
    // Display version number
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
        versionDisplay.textContent = VERSION;
    }
    
    // Force refresh button - reloads with cache-busting parameter (preserves localStorage)
    const forceRefreshBtn = document.getElementById('force-refresh-btn');
    forceRefreshBtn?.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now().toString());
        window.location.href = url.toString();
    });
    
    if (playerNameInput) {
        const playerName = initialSettings.playerName || '   ';
        // Display only first 3 characters, uppercase
        playerNameInput.value = playerName.substring(0, 3).toUpperCase();
    }
    if (controlZoneHeightInput) controlZoneHeightInput.value = String(initialSettings.controlZoneHeight ?? 0.5);
    if (controlZoneMaxScaleInput) controlZoneMaxScaleInput.value = String(initialSettings.controlZoneMaxScale ?? 4);
    if (controlZoneMinScaleInput) controlZoneMinScaleInput.value = String(initialSettings.controlZoneMinScale ?? 2);
    // Update value displays
    if (controlZoneHeightValue && controlZoneHeightInput) {
        controlZoneHeightValue.textContent = `${Math.round(parseFloat(controlZoneHeightInput.value) * 100)}%`;
    }
    if (controlZoneMaxScaleValue && controlZoneMaxScaleInput) {
        controlZoneMaxScaleValue.textContent = `${Math.round(parseFloat(controlZoneMaxScaleInput.value))}x`;
    }
    if (controlZoneMinScaleValue && controlZoneMinScaleInput) {
        controlZoneMinScaleValue.textContent = `${Math.round(parseFloat(controlZoneMinScaleInput.value))}x`;
    }


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
            showGhostPreview: true, // Always enabled - no longer a user setting
            enableAnimations: animationInput?.checked ?? true,
            soundEnabled: soundInput?.checked ?? true,
            theme: themeValue,
            mode: modeValue,
            showPointValues: pointValuesInput?.checked ?? false,
            autoplaceEnabled: autoplaceInput?.checked ?? true,
            playerName: (playerNameInput?.value.trim().substring(0, 3).toUpperCase() || '').padEnd(3, ' '),
            devMode: devModeInput?.checked ?? true, // Default to true
            controlZoneHeight: controlZoneHeightInput ? parseFloat(controlZoneHeightInput.value) : (initialSettings.controlZoneHeight ?? 0.5),
            controlZoneMaxScale: controlZoneMaxScaleInput ? Math.round(parseFloat(controlZoneMaxScaleInput.value)) : (initialSettings.controlZoneMaxScale ?? 4),
            controlZoneMinScale: controlZoneMinScaleInput ? Math.round(parseFloat(controlZoneMinScaleInput.value)) : (initialSettings.controlZoneMinScale ?? 2),
            showGameOverDialog: showGameOverDialogInput?.checked ?? true,
        };
        game.updateSettings(updatedSettings);
        saveSettings(updatedSettings); // Save to localStorage
        updateAutoplaceButtonVisibility(updatedSettings.autoplaceEnabled);
        updateDevLogVisibility(updatedSettings.devMode);
    };
    
    /**
     * Updates the autoplace button visibility based on the setting
     */
    const updateAutoplaceButtonVisibility = (enabled: boolean): void => {
        const autoPlaceButton = document.getElementById('auto-place-button');
        if (autoPlaceButton) {
            if (enabled) {
                autoPlaceButton.style.display = '';
            } else {
                autoPlaceButton.style.display = 'none';
            }
        }
    };
    
    // Initialize button visibility based on initial settings
    updateAutoplaceButtonVisibility(initialSettings.autoplaceEnabled);

    // Mode select is always enabled but warns if changing during a session
    // Store last confirmed mode to detect when user cancels the change
    let lastConfirmedMode = initialSettings.mode;
    
    const updateModeSelectState = () => {
        // Mode select is always enabled - no longer disabled during play
    };

    // ghostInput removed - ghost preview is always on
    [gridInput, animationInput, soundInput, pointValuesInput, autoplaceInput, devModeInput].forEach(input => {
        input?.addEventListener('change', () => {
            pushToGame();
        });
    });
    
    // Control zone settings - update value displays and push to game
    controlZoneHeightInput?.addEventListener('input', () => {
        if (controlZoneHeightValue && controlZoneHeightInput) {
            controlZoneHeightValue.textContent = `${Math.round(parseFloat(controlZoneHeightInput.value) * 100)}%`;
        }
        pushToGame();
    });
    controlZoneMaxScaleInput?.addEventListener('input', () => {
        if (controlZoneMaxScaleValue && controlZoneMaxScaleInput) {
            controlZoneMaxScaleValue.textContent = `${Math.round(parseFloat(controlZoneMaxScaleInput.value))}x`;
        }
        pushToGame();
    });
    controlZoneMinScaleInput?.addEventListener('input', () => {
        if (controlZoneMinScaleValue && controlZoneMinScaleInput) {
            controlZoneMinScaleValue.textContent = `${Math.round(parseFloat(controlZoneMinScaleInput.value))}x`;
        }
        pushToGame();
    });
    
    // Player name input - update on blur (when user finishes typing)
    // Clear to empty on focus, limit to 3 characters and convert to uppercase
    playerNameInput?.addEventListener('focus', (e) => {
        const input = e.target as HTMLInputElement;
        // Clear the field when user focuses to allow fresh input
        input.value = '';
    });
    playerNameInput?.addEventListener('input', (e) => {
        const input = e.target as HTMLInputElement;
        // Convert to uppercase and limit to 3 characters
        input.value = input.value.toUpperCase().substring(0, 3);
    });
    playerNameInput?.addEventListener('blur', pushToGame);
    playerNameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            playerNameInput.blur();
        }
    });

    themeSelect?.addEventListener('change', pushToGame);
    
    // Mode select with confirmation when changing during active game
    modeSelect?.addEventListener('change', () => {
        const newMode = modeSelect.value as GameMode;
        
        // Check if game is in session and mode is actually changing
        if (game.isGameInSession() && newMode !== lastConfirmedMode) {
            const confirmed = window.confirm(
                'Changing difficulty will reset the current game. Do you want to continue?'
            );
            
            if (confirmed) {
                // User confirmed - reset game and apply new mode
                lastConfirmedMode = newMode;
                pushToGame();
                game.reset(true); // Force reset to start fresh with new mode
            } else {
                // User cancelled - revert the select back to previous mode
                modeSelect.value = lastConfirmedMode;
            }
        } else {
            // Not in session or same mode - just apply
            lastConfirmedMode = newMode;
            pushToGame();
        }
    });
    
    // Initialize mode display
    updateModeDisplay(initialSettings.mode);

    const togglePanel = (open: boolean) => {
        panel?.classList.toggle('is-visible', open);
        backdrop?.classList.toggle('is-visible', open);
        panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
        backdrop?.setAttribute('aria-hidden', open ? 'false' : 'true');
        // Prevent body scroll when panel is open on mobile
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    };

    openButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        // Resume sound context on first user interaction (fixes autoplay policy)
        game.resumeSoundContext();
        togglePanel(true);
    });
    closeButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(false);
    });
    backdrop?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(false);
    });
    // Prevent panel clicks from closing the panel
    panel?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            togglePanel(false);
            toggleHelpPanel(false);
        }
    });

    // Settings help panel handlers
    const helpButton = document.getElementById('settings-help-button');
    const helpPanel = document.getElementById('settings-help-panel');
    const helpBackdrop = document.getElementById('settings-help-backdrop');
    const closeHelpButton = document.getElementById('close-settings-help-button');

    function toggleHelpPanel(show: boolean): void {
        if (helpPanel && helpBackdrop) {
            if (show) {
                helpPanel.classList.add('visible');
                helpBackdrop.classList.add('visible');
                helpPanel.setAttribute('aria-hidden', 'false');
                helpBackdrop.setAttribute('aria-hidden', 'false');
            } else {
                helpPanel.classList.remove('visible');
                helpBackdrop.classList.remove('visible');
                helpPanel.setAttribute('aria-hidden', 'true');
                helpBackdrop.setAttribute('aria-hidden', 'true');
            }
        }
    }

    helpButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHelpPanel(true);
    });
    closeHelpButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHelpPanel(false);
    });
    helpBackdrop?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHelpPanel(false);
    });
    helpPanel?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Return the update functions so they can be called from outside
    return { updateModeSelectState, updateAutoplaceButtonVisibility };
}

function setupLeaderboardPopup(initialSettings: GameSettings): void {
    const panel = document.getElementById('leaderboard-panel');
    const backdrop = document.getElementById('leaderboard-backdrop');
    const openButton = document.getElementById('leaderboard-button');
    const closeButton = document.getElementById('close-leaderboard-button');

    const leaderboardContainer = document.getElementById('leaderboard-list');
    const leaderboardLoading = document.getElementById('leaderboard-loading');
    const leaderboardError = document.getElementById('leaderboard-error');
    const leaderboardEasyBtn = document.getElementById('leaderboard-mode-easy');
    const leaderboardHardBtn = document.getElementById('leaderboard-mode-hard');
    const leaderboardTodayBtn = document.getElementById('leaderboard-period-today');
    const leaderboardWeekBtn = document.getElementById('leaderboard-period-week');
    const leaderboardEverBtn = document.getElementById('leaderboard-period-ever');
    
    let currentLeaderboardMode: GameMode = initialSettings.mode;
    let currentLeaderboardPeriod: LeaderboardPeriod = 'ever';
    
    /**
     * Formats a timestamp based on the leaderboard period
     * Uses local timezone for user-friendly display
     * - today: shows time (e.g., "8:00am")
     * - week: shows day of week (e.g., "Tue")
     * - ever: shows compact date (e.g., "1/12/25")
     */
    function formatDate(timestamp: number, period: LeaderboardPeriod): string {
        const date = new Date(timestamp);
        
        if (period === 'today') {
            // Show time for today's scores in local time (e.g., "8:00am")
            const hours = date.getHours();
            const minutes = date.getMinutes();
            const ampm = hours >= 12 ? 'pm' : 'am';
            const displayHours = hours % 12 || 12; // Convert to 12-hour format
            const displayMinutes = minutes.toString().padStart(2, '0');
            return `${displayHours}:${displayMinutes}${ampm}`;
        } else if (period === 'week') {
            // Show day of week for this week's scores in local time (e.g., "Tue")
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            return days[date.getDay()];
        } else {
            // Show compact date for all-time scores in local time (e.g., "1/12/25")
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const year = date.getFullYear() % 100; // Last 2 digits of year
            return `${month}/${day}/${year}`;
        }
    }
    
    /**
     * Formats a number with commas
     */
    function formatNumber(num: number): string {
        return num.toLocaleString('en-US');
    }
    
    /**
     * Escapes HTML to prevent XSS
     */
    function escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Renders the leaderboard entries
     * Limits to top 10 entries for each combination of mode and period
     */
    function renderLeaderboard(entries: LeaderboardEntry[], period: LeaderboardPeriod): void {
        if (!leaderboardContainer) return;
        
        // Always show exactly 10 rows
        // Pad with empty rows if we have fewer than 10 entries
        const topEntries = entries.slice(0, 10);
        const emptyRowsNeeded = Math.max(0, 10 - topEntries.length);
        
        // Render existing entries
        const entriesHtml = topEntries.map(entry => {
            return `
                <div class="leaderboard-entry">
                    <span class="leaderboard-rank">#${entry.rank}</span>
                    <span class="leaderboard-name">${escapeHtml((entry.playerName || '   ').substring(0, 3).toUpperCase().padEnd(3, ' '))}</span>
                    <span class="leaderboard-score">${formatNumber(entry.score)}</span>
                    <span class="leaderboard-date">${formatDate(entry.timestamp, period)}</span>
                </div>
            `;
        }).join('');
        
        // Render empty rows for missing entries
        const emptyRowsHtml = Array.from({ length: emptyRowsNeeded }, (_, i) => {
            const rank = topEntries.length + i + 1;
            return `
                <div class="leaderboard-entry leaderboard-entry-empty">
                    <span class="leaderboard-rank">#${rank}</span>
                    <span class="leaderboard-name">---</span>
                    <span class="leaderboard-score">---</span>
                    <span class="leaderboard-date">---</span>
                </div>
            `;
        }).join('');
        
        leaderboardContainer.innerHTML = entriesHtml + emptyRowsHtml;
    }
    
    // Cache for leaderboard data to avoid unnecessary refetches when switching views
    const leaderboardCache: Map<string, LeaderboardEntry[]> = new Map();
    
    /**
     * Gets cache key for a mode/period combination
     */
    function getCacheKey(mode: GameMode, period: LeaderboardPeriod): string {
        return `${mode}-${period}`;
    }
    
    /**
     * Refreshes all leaderboard combinations in the background
     * This ensures all data is fresh when the user switches between views
     */
    async function refreshAllLeaderboards(): Promise<void> {
        const modes: GameMode[] = ['easy', 'hard'];
        const periods: LeaderboardPeriod[] = ['today', 'week', 'ever'];
        const currentSettings = loadSettings();
        
        // Fetch all combinations in parallel
        const fetchPromises = modes.flatMap(mode =>
            periods.map(async (period) => {
                try {
                    const entries = await getLeaderboard(mode, period);
                    const cacheKey = getCacheKey(mode, period);
                    leaderboardCache.set(cacheKey, entries);
                    if (currentSettings.devMode) {
                        console.log(`[LEADERBOARD] Refreshed ${mode}/${period}: ${entries.length} entries`);
                    }
                } catch (error) {
                    if (currentSettings.devMode) {
                        console.warn(`[LEADERBOARD] Failed to refresh ${mode}/${period}:`, error);
                    }
                    // Don't update cache on error - keep old data if available
                }
            })
        );
        
        // Wait for all fetches to complete (but don't block UI)
        await Promise.allSettled(fetchPromises);
    }
    
    /**
     * Loads and displays the leaderboard for the current mode and period
     */
    async function loadLeaderboard(mode: GameMode, period: LeaderboardPeriod = currentLeaderboardPeriod): Promise<void> {
        if (!leaderboardContainer || !leaderboardLoading || !leaderboardError) return;
        
        currentLeaderboardMode = mode;
        currentLeaderboardPeriod = period;
        
        // Show loading state
        leaderboardLoading.style.display = 'block';
        leaderboardError.style.display = 'none';
        leaderboardContainer.innerHTML = '';
        
        // Update mode button states
        if (leaderboardEasyBtn && leaderboardHardBtn) {
            leaderboardEasyBtn.classList.toggle('active', mode === 'easy');
            leaderboardHardBtn.classList.toggle('active', mode === 'hard');
        }
        
        // Update period button states
        if (leaderboardTodayBtn && leaderboardWeekBtn && leaderboardEverBtn) {
            leaderboardTodayBtn.classList.toggle('active', period === 'today');
            leaderboardWeekBtn.classList.toggle('active', period === 'week');
            leaderboardEverBtn.classList.toggle('active', period === 'ever');
        }
        
        // Check cache first for instant display
        const cacheKey = getCacheKey(mode, period);
        const cachedEntries = leaderboardCache.get(cacheKey);
        
        if (cachedEntries) {
            // Show cached data immediately
            leaderboardLoading.style.display = 'none';
            renderLeaderboard(cachedEntries, period);
        }
        
        try {
            const currentSettings = loadSettings();
            if (currentSettings.devMode) {
                console.log(`[LEADERBOARD] Loading leaderboard for mode: ${mode}, period: ${period}`);
            }
            // Always fetch fresh data (will update cache and display)
            const entries = await getLeaderboard(mode, period);
            leaderboardCache.set(cacheKey, entries); // Update cache
            if (currentSettings.devMode) {
                console.log(`[LEADERBOARD] Received ${entries.length} entries`);
            }
            leaderboardLoading.style.display = 'none';
            renderLeaderboard(entries, period);
        } catch (error) {
            const currentSettings = loadSettings();
            if (currentSettings.devMode) {
                console.error('Failed to load leaderboard:', error);
            }
            leaderboardLoading.style.display = 'none';
            if (leaderboardError) {
                leaderboardError.style.display = 'block';
                leaderboardError.textContent = `Failed to load leaderboard: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
            // If we had cached data, show it even on error
            if (cachedEntries) {
                renderLeaderboard(cachedEntries, period);
            }
        }
    }
    
    // Set up leaderboard mode selector buttons
    leaderboardEasyBtn?.addEventListener('click', () => {
        loadLeaderboard('easy', currentLeaderboardPeriod);
    });
    
    leaderboardHardBtn?.addEventListener('click', () => {
        loadLeaderboard('hard', currentLeaderboardPeriod);
    });
    
    // Set up leaderboard period selector buttons
    leaderboardTodayBtn?.addEventListener('click', () => {
        loadLeaderboard(currentLeaderboardMode, 'today');
    });
    
    leaderboardWeekBtn?.addEventListener('click', () => {
        loadLeaderboard(currentLeaderboardMode, 'week');
    });
    
    leaderboardEverBtn?.addEventListener('click', () => {
        loadLeaderboard(currentLeaderboardMode, 'ever');
    });

    const togglePanel = (open: boolean) => {
        panel?.classList.toggle('is-visible', open);
        backdrop?.classList.toggle('is-visible', open);
        panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
        backdrop?.setAttribute('aria-hidden', open ? 'false' : 'true');
        // Prevent body scroll when panel is open on mobile
        if (open) {
            document.body.style.overflow = 'hidden';
            // Load current leaderboard immediately
            loadLeaderboard(currentLeaderboardMode, currentLeaderboardPeriod);
            // Refresh all leaderboard combinations in the background
            refreshAllLeaderboards().catch(error => {
                const currentSettings = loadSettings();
                if (currentSettings.devMode) {
                    console.warn('[LEADERBOARD] Background refresh failed:', error);
                }
            });
        } else {
            document.body.style.overflow = '';
        }
    };

    openButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(true);
    });
    closeButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(false);
    });
    backdrop?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(false);
    });
    // Prevent panel clicks from closing the panel
    panel?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panel?.classList.contains('is-visible')) {
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
        // Account for #app padding on mobile (5px each side = 10px total)
        const isMobile = window.innerWidth <= 768;
        const appPadding = isMobile ? 10 : 0;
        
        // Get viewport width - use innerWidth as primary source
        const viewportWidth = window.innerWidth;
        
        // Get viewport height - use window.innerHeight as primary source (most reliable on Safari)
        let viewportHeight = window.innerHeight;
        
        // On Safari, also check visualViewport and use the SMALLER value
        // This handles cases where Safari reports different heights for different APIs
        if (window.visualViewport) {
            viewportHeight = Math.min(viewportHeight, window.visualViewport.height);
        }
        
        // Also check documentElement.clientHeight as another fallback
        if (document.documentElement.clientHeight < viewportHeight) {
            viewportHeight = document.documentElement.clientHeight;
        }
        
        // On mobile, account for Safari's dynamic toolbar, home indicator, and UI elements
        // Safari's toolbar can be ~50px at top, home indicator ~34px at bottom
        // Plus our UI elements (buttons ~50px, stats ~25px)
        // Total buffer: ~120px to ensure everything fits
        const safariToolbarBuffer = isMobile ? 120 : 0;
        const verticalPadding = isMobile ? 10 : RESPONSIVE_CANVAS_LIMITS.verticalPadding;
        
        const availableHeight = viewportHeight - verticalPadding - safariToolbarBuffer;
        const availableWidth = viewportWidth - RESPONSIVE_CANVAS_LIMITS.horizontalPadding - appPadding;
        
        // The board itself is square (BOARD_PIXEL_SIZE x BOARD_PIXEL_SIZE = 540x540)
        // The canvas is 600px wide x 780px tall (540px board + 20px offset + 220px queue)
        // To ensure the board stays square, we must scale the entire canvas uniformly
        
        // Calculate scale based on width - canvas width must fit
        const widthScale = availableWidth / CANVAS_WIDTH;
        
        // Calculate scale based on height - canvas height must fit
        const heightScale = availableHeight / CANVAS_HEIGHT;
        
        // Use the smaller scale to ensure everything fits
        // Uniform scaling of the entire canvas ensures the board stays square
        let finalScale = Math.min(widthScale, heightScale);
        
        // Clamp to max limit only - on mobile, allow unlimited shrinking to fit screen
        const maxScale = RESPONSIVE_CANVAS_LIMITS.maxHeight / CANVAS_HEIGHT;
        if (isMobile) {
            // On mobile, allow unlimited shrinking to fit any viewport size
            // Ensure scale is positive (sanity check)
            finalScale = Math.max(0.1, Math.min(finalScale, maxScale));
        } else {
            // On desktop, apply min/max limits
            const minScale = RESPONSIVE_CANVAS_LIMITS.minHeight / CANVAS_HEIGHT;
            finalScale = Math.max(minScale, Math.min(finalScale, maxScale));
        }
        
        // Apply scale to canvas - uniform scaling maintains board square aspect ratio
        const scaledWidth = CANVAS_WIDTH * finalScale;
        const scaledHeight = CANVAS_HEIGHT * finalScale;
        
        canvas.style.width = `${scaledWidth}px`;
        canvas.style.height = `${scaledHeight}px`;
    };
    
    // Initial size calculation
    updateCanvasSize();
    
    // Add delayed recalculations for Safari to stabilize its viewport measurements
    // Safari often reports incorrect viewport height on initial load
    setTimeout(updateCanvasSize, 100);
    setTimeout(updateCanvasSize, 500);
    
    // Listen to resize events
    window.addEventListener('resize', updateCanvasSize);
    
    // Listen to visualViewport changes for Safari (handles zoom, keyboard, dynamic toolbars)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateCanvasSize);
        window.visualViewport.addEventListener('scroll', updateCanvasSize);
    }
}

function setupResponsiveUI(canvas: HTMLCanvasElement): void {
    const updateUIWidth = () => {
        const canvasWidth = canvas.offsetWidth;
        const topStats = document.getElementById('top-stats');
        const highScores = document.getElementById('high-scores');
        const buttonContainer = document.getElementById('button-container');
        
        // Only update if canvas has a valid width (prevents setting width to 0)
        // If invalid, clear inline styles to let CSS handle it
        if (canvasWidth <= 0) {
            if (topStats) {
                topStats.style.width = '';
            }
            if (highScores) {
                highScores.style.width = '';
            }
            if (buttonContainer) {
                buttonContainer.style.width = '';
            }
            return;
        }
        
        if (topStats) {
            topStats.style.width = `${canvasWidth}px`;
        }
        if (highScores) {
            highScores.style.width = `${canvasWidth}px`;
        }
        if (buttonContainer) {
            buttonContainer.style.width = `${canvasWidth}px`;
        }
        
        // Use --font-lg (20px) for score displays
        const scoreFontSize = 20; // --font-lg value
        const progressBarHeight = Math.max(24, Math.min(40, (canvasWidth / 600) * 32));
        
        // Update font sizes to use --font-lg
        const scoreDisplay = document.getElementById('score-display');
        const turnDisplay = document.getElementById('turn-display');
        const linesDisplay = document.getElementById('lines-display');
        const highScoreToday = document.getElementById('high-score-today-display');
        const highScoreWeek = document.getElementById('high-score-week-display');
        const highScoreYear = document.getElementById('high-score-year-display');
        const modeDisplay = document.getElementById('mode-display');
        
        [scoreDisplay, turnDisplay, linesDisplay, highScoreToday, highScoreWeek, highScoreYear, modeDisplay].forEach(el => {
            if (el) {
                el.style.fontSize = `${scoreFontSize}px`;
            }
        });
        
        // Update progress bar - spans full screen width
        const progressContainer = document.getElementById('level-progress-container');
        if (progressContainer) {
            progressContainer.style.height = `${progressBarHeight}px`;
        }
        
        // Update progress boxes to fill full screen width (can be rectangles)
        const progressBoxes = document.querySelectorAll('.progress-box');
        const borderRadius = Math.max(3, Math.min(6, progressBarHeight * 0.125));
        
        // Progress boxes now use flex: 1 to fill available width
        // Height is set by CSS to fill container
        progressBoxes.forEach(box => {
            const boxEl = box as HTMLElement;
            boxEl.style.borderRadius = `${borderRadius}px`;
            // Let CSS handle width (flex: 1) and height
            boxEl.style.width = '';
            boxEl.style.height = '';
            boxEl.style.flex = '1 1 auto'; // Flex to fill available space
        });
    };
    
    updateUIWidth();
    window.addEventListener('resize', updateUIWidth);
    
    // Also update when canvas size changes
    const resizeObserver = new ResizeObserver(updateUIWidth);
    resizeObserver.observe(canvas);
}

function setupHighScores(game: Game, initialSettings: GameSettings): (mode: GameMode) => void {
    let currentMode = initialSettings.mode;
    
    /**
     * Formats a number with commas (e.g., 1234 -> "1,234")
     */
    const formatNumber = (num: number): string => {
        return num.toLocaleString('en-US');
    };

    const updateHighScores = () => {
        // Get scores for the current mode
        const scores = getHighScores(currentMode);
        const todayEl = document.getElementById('high-score-today');
        const weekEl = document.getElementById('high-score-week');
        const yearEl = document.getElementById('high-score-year');
        
        if (todayEl) todayEl.textContent = formatNumber(scores.today);
        if (weekEl) weekEl.textContent = formatNumber(scores.week);
        if (yearEl) yearEl.textContent = formatNumber(scores.ever);
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

/**
 * Shows a modal prompt for the user to enter their initials
 * @returns Promise that resolves to the entered initials, or empty string if cancelled
 */
function showPlayerNamePrompt(): Promise<string> {
    return new Promise((resolve) => {
        const backdrop = document.getElementById('player-name-backdrop');
        const panel = document.getElementById('player-name-panel');
        const input = document.getElementById('player-name-input') as HTMLInputElement | null;
        const submitButton = document.getElementById('player-name-submit');
        
        if (!backdrop || !panel || !input || !submitButton) {
            resolve('');
            return;
        }
        
        // Clear input and focus it
        input.value = '';
        input.focus();
        
        // Show the modal
        backdrop.setAttribute('aria-hidden', 'false');
        backdrop.classList.add('is-visible');
        panel.setAttribute('aria-hidden', 'false');
        panel.classList.add('is-visible');
        
        // Handle input - convert to uppercase and limit to 3 characters
        const handleInput = (e: Event) => {
            const target = e.target as HTMLInputElement;
            target.value = target.value.toUpperCase().substring(0, 3);
        };
        
        // Handle submit
        const handleSubmit = () => {
            const value = input.value.trim().toUpperCase();
            if (value.length > 0) {
                // Hide modal
                backdrop.setAttribute('aria-hidden', 'true');
                backdrop.classList.remove('is-visible');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('is-visible');
                
                // Clean up event listeners
                submitButton.removeEventListener('click', handleSubmit);
                input.removeEventListener('keydown', handleKeyDown);
                input.removeEventListener('input', handleInput);
                backdrop.removeEventListener('click', handleBackdropClick);
                
                resolve(value);
            }
        };
        
        // Handle Enter key
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            }
        };
        
        // Close on backdrop click
        const handleBackdropClick = (e: MouseEvent) => {
            if (e.target === backdrop) {
                backdrop.setAttribute('aria-hidden', 'true');
                backdrop.classList.remove('is-visible');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('is-visible');
                
                // Clean up
                backdrop.removeEventListener('click', handleBackdropClick);
                submitButton.removeEventListener('click', handleSubmit);
                input.removeEventListener('keydown', handleKeyDown);
                input.removeEventListener('input', handleInput);
                
                resolve(''); // Return empty string if cancelled
            }
        };
        
        submitButton.addEventListener('click', handleSubmit);
        input.addEventListener('keydown', handleKeyDown);
        input.addEventListener('input', handleInput);
        backdrop.addEventListener('click', handleBackdropClick);
    });
}
