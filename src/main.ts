/**
 * Application entry point - initializes the game and sets up event handlers
 */

import { Game } from './game';
import { GameSettings, ThemeName, GameMode, LeaderboardEntry } from './types';
import { getHighScores, recordScore, getLeaderboard } from './highScores';
import { LeaderboardPeriod } from './api';
import {
    DEFAULT_SETTINGS,
    STORAGE_KEYS,
    HIGH_SCORE_CONFIG,
    RESPONSIVE_CANVAS_LIMITS,
    GAMEPLAY_CONFIG,
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

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const settingsState: GameSettings = loadSettings();
    applyTheme(settingsState.theme);

    // Create progress boxes dynamically based on lines per level
    setupProgressBoxes();

    // Make canvas responsive to window height
    setupResponsiveCanvas(canvas);

    // Sync UI element widths with canvas width
    setupResponsiveUI(canvas);

    // Initialize the game
    const game = new Game(canvas, settingsState);
    game.start();

    const updateHighScoreMode = setupHighScores(game, settingsState);
    const { updateModeSelectState } = setupSettingsControls(game, settingsState, updateHighScoreMode);
    setupLeaderboardPopup(settingsState);

    // Restart button provides explicit control over resetting the board
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.addEventListener('click', () => {
            game.reset(true);
            // Update mode select state after reset
            updateModeSelectState();
        });
    }

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
    const ghostInput = document.getElementById('setting-show-ghost') as HTMLInputElement | null;
    const animationInput = document.getElementById('setting-enable-animations') as HTMLInputElement | null;
    const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement | null;
    const soundInput = document.getElementById('setting-enable-sound') as HTMLInputElement | null;
    const modeSelect = document.getElementById('setting-mode') as HTMLSelectElement | null;
    const pointValuesInput = document.getElementById('setting-show-point-values') as HTMLInputElement | null;
    const autoplaceInput = document.getElementById('setting-autoplace-enabled') as HTMLInputElement | null;
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
    if (ghostInput) ghostInput.checked = initialSettings.showGhostPreview;
    if (animationInput) animationInput.checked = initialSettings.enableAnimations;
    if (themeSelect) themeSelect.value = initialSettings.theme;
    if (soundInput) soundInput.checked = initialSettings.soundEnabled;
    if (modeSelect) modeSelect.value = initialSettings.mode;
    if (pointValuesInput) pointValuesInput.checked = initialSettings.showPointValues;
    if (autoplaceInput) autoplaceInput.checked = initialSettings.autoplaceEnabled;
    if (devModeInput) devModeInput.checked = initialSettings.devMode ?? false;
    if (playerNameInput) {
        const playerName = initialSettings.playerName || '   ';
        // Display only first 3 characters, uppercase
        playerNameInput.value = playerName.substring(0, 3).toUpperCase();
    }
    if (controlZoneHeightInput) controlZoneHeightInput.value = String(initialSettings.controlZoneHeight ?? 0.33);
    if (controlZoneMaxScaleInput) controlZoneMaxScaleInput.value = String(initialSettings.controlZoneMaxScale ?? 3.0);
    if (controlZoneMinScaleInput) controlZoneMinScaleInput.value = String(initialSettings.controlZoneMinScale ?? 1.5);
    
    // Update value displays
    if (controlZoneHeightValue && controlZoneHeightInput) {
        controlZoneHeightValue.textContent = `${Math.round(parseFloat(controlZoneHeightInput.value) * 100)}%`;
    }
    if (controlZoneMaxScaleValue && controlZoneMaxScaleInput) {
        controlZoneMaxScaleValue.textContent = `${parseFloat(controlZoneMaxScaleInput.value).toFixed(1)}x`;
    }
    if (controlZoneMinScaleValue && controlZoneMinScaleInput) {
        controlZoneMinScaleValue.textContent = `${parseFloat(controlZoneMinScaleInput.value).toFixed(1)}x`;
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
            showGhostPreview: ghostInput?.checked ?? true,
            enableAnimations: animationInput?.checked ?? true,
            soundEnabled: soundInput?.checked ?? true,
            theme: themeValue,
            mode: modeValue,
            showPointValues: pointValuesInput?.checked ?? false,
            autoplaceEnabled: autoplaceInput?.checked ?? true,
            playerName: (playerNameInput?.value.trim().substring(0, 3).toUpperCase() || '').padEnd(3, ' '),
            devMode: devModeInput?.checked ?? true, // Default to true
            controlZoneHeight: controlZoneHeightInput ? parseFloat(controlZoneHeightInput.value) : (initialSettings.controlZoneHeight ?? 0.33),
            controlZoneMaxScale: controlZoneMaxScaleInput ? parseFloat(controlZoneMaxScaleInput.value) : (initialSettings.controlZoneMaxScale ?? 3.0),
            controlZoneMinScale: controlZoneMinScaleInput ? parseFloat(controlZoneMinScaleInput.value) : (initialSettings.controlZoneMinScale ?? 1.5),
        };
        game.updateSettings(updatedSettings);
        saveSettings(updatedSettings); // Save to localStorage
        updateAutoplaceButtonVisibility(updatedSettings.autoplaceEnabled);
        
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

    // Update mode select disabled state based on game session
    // Note: Only the difficulty (mode) select is disabled during play.
    // The settings button and panel remain fully accessible.
    const updateModeSelectState = () => {
        const isInSession = game.isGameInSession();
        if (modeSelect) {
            modeSelect.disabled = isInSession;
            if (isInSession) {
                modeSelect.title = 'Cannot change difficulty while a game is in progress';
            } else {
                modeSelect.title = '';
            }
        }
        // Settings button and panel are never disabled - only the mode select is restricted
    };

    // Check game state periodically to update mode select
    setInterval(updateModeSelectState, 500);
    updateModeSelectState(); // Initial check

    [gridInput, ghostInput, animationInput, soundInput, pointValuesInput, autoplaceInput, devModeInput].forEach(input => {
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
            controlZoneMaxScaleValue.textContent = `${parseFloat(controlZoneMaxScaleInput.value).toFixed(1)}x`;
        }
        pushToGame();
    });
    controlZoneMinScaleInput?.addEventListener('input', () => {
        if (controlZoneMinScaleValue && controlZoneMinScaleInput) {
            controlZoneMinScaleValue.textContent = `${parseFloat(controlZoneMinScaleInput.value).toFixed(1)}x`;
        }
        pushToGame();
    });
    
    // Player name input - update on blur (when user finishes typing)
    // Limit to 3 characters and convert to uppercase
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
    modeSelect?.addEventListener('change', pushToGame);
    
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
        }
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
     * Formats a timestamp to a readable date string
     */
    function formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString();
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
     */
    function renderLeaderboard(entries: LeaderboardEntry[]): void {
        if (!leaderboardContainer) return;
        
        if (entries.length === 0) {
            leaderboardContainer.innerHTML = '<div class="leaderboard-empty">No scores yet. Be the first!</div>';
            return;
        }
        
        const html = entries.map(entry => {
            return `
                <div class="leaderboard-entry">
                    <span class="leaderboard-rank">#${entry.rank}</span>
                    <span class="leaderboard-name">${escapeHtml((entry.playerName || '   ').substring(0, 3).toUpperCase().padEnd(3, ' '))}</span>
                    <span class="leaderboard-score">${formatNumber(entry.score)}</span>
                    <span class="leaderboard-date">${formatDate(entry.timestamp)}</span>
                </div>
            `;
        }).join('');
        
        leaderboardContainer.innerHTML = html;
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
        
        try {
            const currentSettings = loadSettings();
            if (currentSettings.devMode) {
                console.log(`[LEADERBOARD] Loading leaderboard for mode: ${mode}, period: ${period}`);
            }
            const entries = await getLeaderboard(mode, period);
            if (currentSettings.devMode) {
                console.log(`[LEADERBOARD] Received ${entries.length} entries`);
            }
            leaderboardLoading.style.display = 'none';
            renderLeaderboard(entries);
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
            // Load leaderboard when panel opens
            loadLeaderboard(currentLeaderboardMode, currentLeaderboardPeriod);
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
        // Account for #app padding on mobile (10px each side = 20px total)
        const isMobile = window.innerWidth <= 768;
        const appPadding = isMobile ? 20 : 0;
        const availableHeight = window.innerHeight - RESPONSIVE_CANVAS_LIMITS.verticalPadding;
        const availableWidth = window.innerWidth - RESPONSIVE_CANVAS_LIMITS.horizontalPadding - appPadding;
        
        // The board itself is square (BOARD_PIXEL_SIZE x BOARD_PIXEL_SIZE = 600x600)
        // The canvas is 600px wide x 820px tall (600px board + 220px queue)
        // To ensure the board stays square, we must scale the entire canvas uniformly
        
        // Calculate scale based on width - canvas width must fit
        const widthScale = availableWidth / CANVAS_WIDTH;
        
        // Calculate scale based on height - canvas height must fit
        const heightScale = availableHeight / CANVAS_HEIGHT;
        
        // Use the smaller scale to ensure everything fits
        // Uniform scaling of the entire canvas ensures the board stays square
        let finalScale = Math.min(widthScale, heightScale);
        
        // Clamp to min/max limits
        const minScale = RESPONSIVE_CANVAS_LIMITS.minHeight / CANVAS_HEIGHT;
        const maxScale = RESPONSIVE_CANVAS_LIMITS.maxHeight / CANVAS_HEIGHT;
        finalScale = Math.max(minScale, Math.min(finalScale, maxScale));
        
        // Apply scale to canvas - uniform scaling maintains board square aspect ratio
        const scaledWidth = CANVAS_WIDTH * finalScale;
        const scaledHeight = CANVAS_HEIGHT * finalScale;
        
        canvas.style.width = `${scaledWidth}px`;
        canvas.style.height = `${scaledHeight}px`;
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
}

function setupResponsiveUI(canvas: HTMLCanvasElement): void {
    const updateUIWidth = () => {
        const canvasWidth = canvas.offsetWidth;
        const topStats = document.getElementById('top-stats');
        const highScores = document.getElementById('high-scores');
        const buttonContainer = document.getElementById('button-container');
        
        if (topStats) {
            topStats.style.width = `${canvasWidth}px`;
        }
        if (highScores) {
            highScores.style.width = `${canvasWidth}px`;
        }
        if (buttonContainer) {
            buttonContainer.style.width = `${canvasWidth}px`;
        }
        
        // Dynamically adjust font sizes based on canvas width
        // Base font size scales with canvas width (600px = 20px font)
        const baseFontSize = Math.max(14, Math.min(24, (canvasWidth / 600) * 20));
        const progressBarHeight = Math.max(24, Math.min(40, (canvasWidth / 600) * 32));
        
        // Update font sizes
        const scoreDisplay = document.getElementById('score-display');
        const turnDisplay = document.getElementById('turn-display');
        const linesDisplay = document.getElementById('lines-display');
        const highScoreToday = document.getElementById('high-score-today-display');
        const highScoreWeek = document.getElementById('high-score-week-display');
        const highScoreYear = document.getElementById('high-score-year-display');
        const modeDisplay = document.getElementById('mode-display');
        
        [scoreDisplay, turnDisplay, linesDisplay, highScoreToday, highScoreWeek, highScoreYear, modeDisplay].forEach(el => {
            if (el) {
                el.style.fontSize = `${baseFontSize}px`;
            }
        });
        
        // Update progress bar height
        const progressContainer = document.getElementById('level-progress-container');
        if (progressContainer) {
            progressContainer.style.height = `${progressBarHeight}px`;
        }
        
        // Update progress boxes to be square and fill horizontal space
        const progressBoxes = document.querySelectorAll('.progress-box');
        const linesPerLevel = getLinesPerLevel();
        const borderRadius = Math.max(3, Math.min(6, progressBarHeight * 0.125));
        
        // Calculate box size: fill width with gaps between boxes
        // Container has 2px padding, boxes have 2px gap between them (1px margin on each side)
        const containerPadding = 4; // 2px on each side
        const totalGaps = (linesPerLevel - 1) * 2; // 2px gap between each box (1px margin each side)
        const availableWidth = canvasWidth - containerPadding - totalGaps;
        const boxSize = Math.floor(availableWidth / linesPerLevel);
        
        // Ensure boxes are square and don't exceed container height
        const maxBoxSize = progressBarHeight - 4; // Account for 2px margin top and bottom
        const finalBoxSize = Math.min(boxSize, maxBoxSize);
        
        progressBoxes.forEach(box => {
            const boxEl = box as HTMLElement;
            boxEl.style.borderRadius = `${borderRadius}px`;
            boxEl.style.width = `${finalBoxSize}px`;
            boxEl.style.height = `${finalBoxSize}px`;
            boxEl.style.flex = '0 0 auto'; // Don't flex, use fixed size
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

