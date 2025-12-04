/**
 * Application entry point - initializes the game and sets up event handlers
 */

import { Game } from './game';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    // Initialize the game
    const game = new Game(canvas);
    game.start();

    // Restart button provides explicit control over resetting the board
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.addEventListener('click', () => {
            game.reset(true);
        });
    }
});

