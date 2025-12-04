/**
 * Main game orchestrator - manages game loop, state, and all game systems
 */

import { Position, Shape, PlacedBlock, DragState, GameState, AnimatingCell, GameSettings } from './types';
import { Board } from './board';
import { generateShapes, getShapeColor, getShapeIndex } from './shapes';
import { Renderer } from './renderer';
import { InputHandler } from './input';
import { calculateScore } from './scoring';
import { checkGameOver } from './gameOver';
import { SoundManager } from './sound';

/**
 * Game class orchestrates all game systems and manages the game loop
 */
export class Game {
    private board: Board;
    private state: GameState;
    private renderer: Renderer;
    private inputHandler: InputHandler;
    private canvas: HTMLCanvasElement;
    private scoreElement: HTMLElement | null;
    private animationFrameId: number | null = null;
    private shapesPlacedThisTurn: number = 0;
    private animatingCells: AnimatingCell[] = [];
    private readonly ANIMATION_DURATION = 300; // milliseconds
    private gameOverStartTime: number | null = null;
    private readonly GAME_OVER_ANIMATION_DURATION = 1000; // milliseconds
    private settings: GameSettings;
    private soundManager: SoundManager;

    constructor(canvas: HTMLCanvasElement, initialSettings: GameSettings) {
        this.canvas = canvas;
        this.settings = { ...initialSettings };
        this.board = new Board();
        this.state = {
            board: this.board.getGrid(),
            queue: generateShapes(),
            placedBlocks: [],
            score: 0,
            gameOver: false,
        };

        this.renderer = new Renderer(canvas, this.settings);
        this.inputHandler = new InputHandler(
            canvas,
            this.board,
            this.state.queue,
            this.handlePlaceShape.bind(this)
        );

        this.scoreElement = document.getElementById('score-value');
        this.soundManager = new SoundManager(initialSettings.soundEnabled);
        this.updateScoreDisplay();
    }

    /**
     * Updates runtime settings originating from the UI panel
     * @param updatedSettings - latest settings selected by the player
     */
    updateSettings(updatedSettings: GameSettings): void {
        this.settings = { ...updatedSettings };
        this.renderer.updateSettings(this.settings);
        this.soundManager.setEnabled(this.settings.soundEnabled);

        if (!this.settings.enableAnimations) {
            // Immediately drop any active animations so the board stays in sync
            this.animatingCells = [];
        }
    }

    /**
     * Starts the game loop
     */
    start(): void {
        this.gameLoop();
    }

    /**
     * Stops the game loop
     */
    stop(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Main game loop - updates and renders each frame
     */
    private gameLoop(): void {
        this.update();
        this.render();
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }

    /**
     * Updates game state
     */
    private update(): void {
        // Update animation progress
        const currentTime = Date.now();
        this.animatingCells = this.animatingCells.filter(cell => {
            const elapsed = currentTime - cell.startTime;
            cell.progress = Math.min(elapsed / this.ANIMATION_DURATION, 1);
            return cell.progress < 1; // Remove completed animations
        });
        
        // Don't update game logic if game is over (freeze the board)
        if (this.state.gameOver) {
            // Still update game over animation
            if (this.gameOverStartTime === null) {
                this.gameOverStartTime = currentTime;
            }
            return;
        }
        
        // Update input handler references
        this.inputHandler.updateBoard(this.board);
        this.inputHandler.updateQueue(this.state.queue);
        
        // Continuously check for game over (proactive detection)
        // This ensures game over is detected even if user can't place any shapes
        if (this.state.queue.length > 0) {
            const isGameOver = checkGameOver(this.board, this.state.queue);
            if (isGameOver) {
                this.triggerGameOver();
            }
        }
        
        // Reset game over animation start time if not game over
        if (!this.state.gameOver) {
            this.gameOverStartTime = null;
        }
    }

    /**
     * Renders the current game state
     */
    private render(): void {
        const dragState = this.inputHandler.getDragState();
        const gameOverProgress = this.gameOverStartTime !== null 
            ? Math.min((Date.now() - this.gameOverStartTime) / this.GAME_OVER_ANIMATION_DURATION, 1)
            : 0;
        this.renderer.render(
            this.board,
            this.state.placedBlocks,
            this.state.queue,
            dragState,
            this.state.gameOver,
            this.animatingCells,
            gameOverProgress
        );
    }

    /**
     * Forces an immediate redraw of the game
     * Useful for debugging or fixing rendering issues
     */
    forceRedraw(): void {
        this.render();
    }

    /**
     * Handles placing a shape on the board
     * Called by the input handler when a shape is dropped
     * @param shapeIndex - Index of the shape in the queue
     * @param position - Grid position where the shape is placed
     */
    private handlePlaceShape(shapeIndex: number, position: Position): void {
        if (this.state.gameOver) {
            return;
        }

        if (shapeIndex < 0 || shapeIndex >= this.state.queue.length) {
            return;
        }

        const shape = this.state.queue[shapeIndex];
        const shapeColor = getShapeColor(getShapeIndex(shape));

        // Place the shape on the board
        this.board.placeShape(shape, position);

        // Add to placed blocks
        const placedBlock: PlacedBlock = {
            shape,
            position,
            color: shapeColor,
        };
        this.state.placedBlocks.push(placedBlock);
        this.soundManager.playPlace();
        console.log(`[PLACE] Placed shape at (${position.x}, ${position.y}), total blocks: ${this.state.placedBlocks.length}`);

        // Remove shape from queue
        this.state.queue.splice(shapeIndex, 1);
        this.shapesPlacedThisTurn++;

        // Check for full rows and columns
        this.checkAndClearLines();

        // If 3 shapes have been placed, generate new queue
        if (this.shapesPlacedThisTurn >= 3) {
            this.shapesPlacedThisTurn = 0;
            this.state.queue = generateShapes();
        }

        // Check for game over after clearing lines and updating queue
        // Game over happens when no shapes can be placed
        if (this.state.queue.length > 0) {
            const isGameOver = checkGameOver(this.board, this.state.queue);
            if (isGameOver) {
                this.triggerGameOver();
            }
        } else {
            // If queue is empty, game is not over yet (waiting for new shapes)
            this.state.gameOver = false;
            this.gameOverStartTime = null;
        }

        this.updateScoreDisplay();
    }

    /**
     * Removes cells from shapes that are in cleared rows or columns
     * @param fullRows - Array of cleared row indices
     * @param fullColumns - Array of cleared column indices
     */
    private removeCellsFromShapes(fullRows: number[], fullColumns: number[]): void {
        const beforeCount = this.state.placedBlocks.length;
        const beforeTotalCells = this.state.placedBlocks.reduce((sum, b) => sum + b.shape.length, 0);
        
        this.state.placedBlocks = this.state.placedBlocks.map(block => {
            // Filter out cells that are in cleared rows or columns
            const remainingCells = block.shape.filter(cell => {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                
                // Keep cell if it's NOT in any cleared row AND NOT in any cleared column
                const inClearedRow = fullRows.includes(absoluteY);
                const inClearedColumn = fullColumns.includes(absoluteX);
                
                return !inClearedRow && !inClearedColumn;
            });
            
            // Return updated block with remaining cells, or null if all cells were removed
            if (remainingCells.length === 0) {
                console.log(`[CLEAR] Removed entire block at (${block.position.x}, ${block.position.y})`);
                return null;
            }
            
            if (remainingCells.length < block.shape.length) {
                console.log(`[CLEAR] Partially removed block: ${block.shape.length} -> ${remainingCells.length} cells`);
            }
            
            return {
                ...block,
                shape: remainingCells
            };
        }).filter((block): block is PlacedBlock => block !== null);
        
        const afterCount = this.state.placedBlocks.length;
        const afterTotalCells = this.state.placedBlocks.reduce((sum, b) => sum + b.shape.length, 0);
        
        if (beforeCount !== afterCount || beforeTotalCells !== afterTotalCells) {
            console.log(`[CLEAR] Shape count: ${beforeCount} -> ${afterCount}, Total cells: ${beforeTotalCells} -> ${afterTotalCells}`);
            console.log(`[CLEAR] Cleared rows: [${fullRows.join(', ')}], columns: [${fullColumns.join(', ')}]`);
        }
    }

    /**
     * Cleans up shapes after animation completes
     * @param fullRows - Array of cleared row indices
     * @param fullColumns - Array of cleared column indices
     */
    private cleanupAfterAnimation(fullRows: number[], fullColumns: number[]): void {
        this.removeCellsFromShapes(fullRows, fullColumns);
    }

    /**
     * Checks for full rows and columns, clears them, and awards points
     * Does NOT clear if game is over - board should remain visible
     */
    private checkAndClearLines(): void {
        // Never clear lines if game is over - board should stay visible
        if (this.state.gameOver) {
            return;
        }
        
        const fullRows = this.board.getFullRows();
        const fullColumns = this.board.getFullColumns();

        if (fullRows.length === 0 && fullColumns.length === 0) {
            return;
        }

        const linesCleared = fullRows.length + fullColumns.length;

        const shouldAnimate = this.settings.enableAnimations;

        if (shouldAnimate) {
            // Start animations for cells being removed
            const currentTime = Date.now();
            
            for (const block of this.state.placedBlocks) {
                for (const cell of block.shape) {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    
                    const inClearedRow = fullRows.includes(absoluteY);
                    const inClearedColumn = fullColumns.includes(absoluteX);
                    
                    if (inClearedRow || inClearedColumn) {
                        // Add to animating cells
                        this.animatingCells.push({
                            x: absoluteX,
                            y: absoluteY,
                            color: block.color,
                            startTime: currentTime,
                            progress: 0
                        });
                    }
                }
            }
        } else {
            this.animatingCells = [];
        }

        // Clear full rows and columns on the board immediately
        for (const row of fullRows) {
            this.board.clearRow(row);
        }

        for (const col of fullColumns) {
            this.board.clearColumn(col);
        }

        const boardCleared = this.willBoardBeCleared(fullRows, fullColumns);
        const points = calculateScore(
            fullRows.length,
            fullColumns.length,
            boardCleared
        );
        this.state.score += points;
        this.updateScoreDisplay();
        this.soundManager.playClear(linesCleared, boardCleared);

        // Remove cells from shapes after animation completes
        if (shouldAnimate && this.animatingCells.length > 0) {
            setTimeout(() => {
                this.removeCellsFromShapes(fullRows, fullColumns);
            }, this.ANIMATION_DURATION);
        } else {
            // No animations, clean up immediately
            this.removeCellsFromShapes(fullRows, fullColumns);
        }
    }

    /**
     * Updates the score display in the UI
     */
    private updateScoreDisplay(): void {
        if (this.scoreElement) {
            this.scoreElement.textContent = this.state.score.toString();
        }
    }

    /**
     * Awards bonus points for remaining cells when the game ends and clears the board.
     */
    private awardGameOverBonus(): void {
        const remainingCells = this.state.placedBlocks.reduce(
            (sum, block) => sum + block.shape.length,
            0
        );

        if (remainingCells > 0) {
            this.state.score += remainingCells;
            this.updateScoreDisplay();
        }

        this.board.reset();
        this.state.placedBlocks = [];
        this.animatingCells = [];
    }

    /**
     * Transitions the game into the game-over state with audio/visual feedback.
     */
    private triggerGameOver(): void {
        if (this.state.gameOver) {
            return;
        }

        this.state.gameOver = true;
        this.gameOverStartTime = Date.now();
        this.awardGameOverBonus();
        this.soundManager.playGameOver();
    }

    /**
     * Determines whether the current clear will remove every remaining block.
     */
    private willBoardBeCleared(fullRows: number[], fullColumns: number[]): boolean {
        if (this.state.placedBlocks.length === 0) {
            return true;
        }

        const clearedRows = new Set(fullRows);
        const clearedCols = new Set(fullColumns);

        for (const block of this.state.placedBlocks) {
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const cleared = clearedRows.has(absoluteY) || clearedCols.has(absoluteX);
                if (!cleared) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Resets the game to initial state
     * Can be forced via UI button even if the round is mid-progress
     */
    reset(force: boolean = false): void {
        if (!force && !this.state.gameOver) {
            console.warn('[RESET] Reset called but game is not over - ignoring');
            return;
        }
        
        const context = this.state.gameOver ? 'game over' : 'manual restart';
        console.log(`[RESET] Resetting game (${context}). Previous blocks: ${this.state.placedBlocks.length}`);
        this.stop();
        
        // This is the ONLY place where board.reset() should be called
        this.board.reset();
        
        this.state = {
            board: this.board.getGrid(),
            queue: generateShapes(),
            placedBlocks: [],
            score: 0,
            gameOver: false,
        };
        this.shapesPlacedThisTurn = 0;
        this.animatingCells = [];
        this.gameOverStartTime = null;
        this.inputHandler.updateBoard(this.board);
        this.inputHandler.updateQueue(this.state.queue);
        this.renderer.updateSettings(this.settings);
        this.updateScoreDisplay();
        this.start();
        console.log('[RESET] Game reset complete');
    }

    /**
     * Gets the current game state (for debugging or external access)
     * @returns A copy of the current game state
     */
    getState(): GameState {
        return { ...this.state };
    }
}

