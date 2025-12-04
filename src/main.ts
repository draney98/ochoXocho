/**
 * Application entry point - initializes the game and sets up event handlers
 */

import { Game } from './game';
import { GameSettings, ThemeName } from './types';

const defaultSettings: GameSettings = {
    showGrid: true,
    showGhostPreview: true,
    enableAnimations: true,
    soundEnabled: true,
    theme: 'classic',
};

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const settingsState: GameSettings = { ...defaultSettings };
    applyTheme(settingsState.theme);

    // Initialize the game
    const game = new Game(canvas, settingsState);
    game.start();

    setupSettingsControls(game, settingsState);

    // Restart button provides explicit control over resetting the board
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.addEventListener('click', () => {
            game.reset(true);
        });
    }
});

function setupSettingsControls(game: Game, initialSettings: GameSettings): void {
    const panel = document.getElementById('settings-panel');
    const backdrop = document.getElementById('settings-backdrop');
    const openButton = document.getElementById('settings-button');
    const closeButton = document.getElementById('close-settings-button');

    const gridInput = document.getElementById('setting-show-grid') as HTMLInputElement | null;
    const ghostInput = document.getElementById('setting-show-ghost') as HTMLInputElement | null;
    const animationInput = document.getElementById('setting-enable-animations') as HTMLInputElement | null;
    const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement | null;
    const soundInput = document.getElementById('setting-enable-sound') as HTMLInputElement | null;

    // Sync inputs with initial settings so toggles reflect any future default changes
    if (gridInput) gridInput.checked = initialSettings.showGrid;
    if (ghostInput) ghostInput.checked = initialSettings.showGhostPreview;
    if (animationInput) animationInput.checked = initialSettings.enableAnimations;
    if (themeSelect) themeSelect.value = initialSettings.theme;
    if (soundInput) soundInput.checked = initialSettings.soundEnabled;

    const pushToGame = () => {
        const themeValue = (themeSelect?.value as ThemeName) ?? initialSettings.theme;
        applyTheme(themeValue);

        const updatedSettings: GameSettings = {
            showGrid: gridInput?.checked ?? true,
            showGhostPreview: ghostInput?.checked ?? true,
            enableAnimations: animationInput?.checked ?? true,
            soundEnabled: soundInput?.checked ?? true,
            theme: themeValue,
        };
        game.updateSettings(updatedSettings);
    };

    [gridInput, ghostInput, animationInput, soundInput].forEach(input => {
        input?.addEventListener('change', pushToGame);
    });

    themeSelect?.addEventListener('change', pushToGame);

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

