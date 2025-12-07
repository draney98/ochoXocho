/**
 * Main game orchestrator - manages game loop, state, and all game systems
 */

import { Position, Shape, PlacedBlock, DragState, GameState, AnimatingCell, GameSettings } from './types';
import { Board } from './board';
import { generateShapes, generateEasyShapes, getShapeColor, getShapeIndex, getShapePointValue, updateColorScheme } from './shapes';
import { Renderer } from './renderer';
import { InputHandler } from './input';
import { calculateScore } from './scoring';
import { checkGameOver } from './gameOver';
import { SoundManager } from './sound';
import { recordScore } from './highScores';
import { GAMEPLAY_CONFIG, ANIMATION_CONFIG, GAME_OVER_CONFIG } from './config';
import { getUIColorForLevel, getButtonColors } from './colorConfig';
import { findOptimalPlacementOrder } from './boardUtils';

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
    private turnElement: HTMLElement | null;
    private linesElement: HTMLElement | null;
    private levelElement: HTMLElement | null;
    private levelProgressElement: HTMLElement | null;
    private emojiBoardElement: HTMLElement | null;
    private animationFrameId: number | null = null;
    private shapesPlacedThisTurn: number = 0;
    private animatingCells: AnimatingCell[] = [];
    private readonly ANIMATION_DURATION = ANIMATION_CONFIG.lineClearMs;
    private gameOverStartTime: number | null = null;
    private readonly GAME_OVER_ANIMATION_DURATION = ANIMATION_CONFIG.gameOverFadeMs;
    private gameOverPopComplete: boolean = false;
    private levelUpStartTime: number | null = null;
    private readonly LEVEL_UP_ANIMATION_DURATION = ANIMATION_CONFIG.levelUpMs;
    private settings: GameSettings;
    private soundManager: SoundManager;
    // Animation index is based on level, not cycling

    constructor(canvas: HTMLCanvasElement, initialSettings: GameSettings) {
        this.canvas = canvas;
        this.settings = { ...initialSettings };
        this.board = new Board();
        // Generate initial queue based on mode
        const initialQueue = this.settings.mode === 'easy' 
            ? generateEasyShapes(this.board)
            : generateShapes();
        
        this.state = {
            board: this.board.getGrid(),
            queue: initialQueue,
            placedBlocks: [],
            score: 0,
            gameOver: false,
            level: 1,
            levelProgress: 0,
            totalShapesPlaced: 0,
            turn: 0,
            linesCleared: 0,
        };

        this.renderer = new Renderer(canvas, this.settings);
        this.inputHandler = new InputHandler(
            canvas,
            this.board,
            this.state.queue,
            this.handlePlaceShape.bind(this),
            this.removeShapeFromQueue.bind(this),
            this.restoreShapeToQueue.bind(this)
        );

        this.scoreElement = document.getElementById('score-value');
        this.turnElement = document.getElementById('turn-value');
        this.linesElement = document.getElementById('lines-value');
        this.levelElement = null; // Level number removed, only progress bar shown
        this.levelProgressElement = null; // No longer using single progress bar element
        this.emojiBoardElement = null; // Emoji board is now only shown on game over screen
        this.soundManager = new SoundManager(initialSettings.soundEnabled);
        // Initialize color scheme for starting level
        updateColorScheme(this.state.level);
        this.updateScoreDisplay();
        this.updateTurnDisplay();
        this.updateLinesDisplay();
        this.updateLevelDisplay();
    }

    /**
     * Updates runtime settings originating from the UI panel
     * @param updatedSettings - latest settings selected by the player
     */
    updateSettings(updatedSettings: GameSettings): void {
        const modeChanged = this.settings.mode !== updatedSettings.mode;
        const themeChanged = this.settings.theme !== updatedSettings.theme;
        this.settings = { ...updatedSettings };
        this.renderer.updateSettings(this.settings);
        this.soundManager.setEnabled(this.settings.soundEnabled);

        // Update UI colors if theme changed
        if (themeChanged) {
            this.updateUIColors();
        }

        if (!this.settings.enableAnimations) {
            // Immediately drop any active animations so the board stays in sync
            this.animatingCells = [];
        }
        
        // If mode changed and game is not over, regenerate queue with new mode
        if (modeChanged && !this.state.gameOver) {
            this.state.queue = this.settings.mode === 'easy'
                ? generateEasyShapes(this.board)
                : generateShapes();
            this.inputHandler.updateQueue(this.state.queue);
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
        // Only show fade overlay after popping animation completes
        const gameOverProgress = (this.gameOverStartTime !== null && this.gameOverPopComplete)
            ? Math.min((Date.now() - this.gameOverStartTime) / this.GAME_OVER_ANIMATION_DURATION, 1)
            : 0;
        // Calculate level up animation progress
        const levelUpProgress = this.levelUpStartTime !== null
            ? Math.min((Date.now() - this.levelUpStartTime) / this.LEVEL_UP_ANIMATION_DURATION, 1)
            : 0;
        // Clear level up animation if it's complete
        if (levelUpProgress >= 1) {
            this.levelUpStartTime = null;
        }
        this.renderer.render(
            this.board,
            this.state.placedBlocks,
            this.state.queue,
            dragState,
            this.state.gameOver,
            this.animatingCells,
            gameOverProgress,
            this.state.totalShapesPlaced,
            levelUpProgress,
            this.state.level,
            this.state.score,
            this.state.linesCleared
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
     * Removes a shape from the queue when it's selected for dragging
     * @param shapeIndex - Index of the shape to remove
     */
    private removeShapeFromQueue(shapeIndex: number): void {
        if (shapeIndex < 0 || shapeIndex >= this.state.queue.length) {
            return;
        }
        // Leave a hole instead of shifting positions so queue slots stay fixed
        this.state.queue[shapeIndex] = null;
        this.inputHandler.updateQueue(this.state.queue);
    }

    /**
     * Restores a shape to the queue at the specified index (when drag is cancelled or invalid)
     * @param shapeIndex - Index where the shape should be restored
     * @param shape - The shape to restore
     */
    private restoreShapeToQueue(shapeIndex: number, shape: Shape): void {
        if (shapeIndex < 0) {
            return;
        }
        // Ensure the queue has a slot at this index
        while (this.state.queue.length < 3) {
            this.state.queue.push(null);
        }
        this.state.queue[shapeIndex] = shape;
        this.inputHandler.updateQueue(this.state.queue);
    }

    /**
     * Handles placing a shape on the board
     * Called by the input handler when a shape is dropped
     * @param shapeIndex - Index of the shape that was in the queue (before removal)
     * @param position - Grid position where the shape is placed
     */
    private handlePlaceShape(shapeIndex: number, position: Position): void {
        if (this.state.gameOver) {
            return;
        }

        // Shape was already removed from queue when dragging started
        // We need to get the shape from the drag state instead
        const dragState = this.inputHandler.getDragState();
        if (!dragState.shape) {
            return;
        }

        const shape = dragState.shape;
        const shapeIndexInPool = getShapeIndex(shape);
        const shapeColor = getShapeColor(shapeIndexInPool);
        // Newly placed blocks start with base value (1-8) - store this value
        const basePointValue = getShapePointValue(shapeIndexInPool, 0);

        // Place the shape on the board
        this.board.placeShape(shape, position);

        // Add to placed blocks - store the base point value
        const placedBlock: PlacedBlock = {
            shape,
            position,
            color: shapeColor,
            pointValue: basePointValue,  // Store base value (original, never modified)
            lineClearBonuses: 0,  // Track line clear bonuses separately
            totalShapesPlacedAtPlacement: this.state.totalShapesPlaced,
            shapeIndex: shapeIndexInPool,  // Store the original shape index
            darkness: 1.0,  // Start at full brightness
        };
        this.state.placedBlocks.push(placedBlock);
        // Resume AudioContext on first user interaction (fixes autoplay policy)
        this.soundManager.resumeContext();
        this.soundManager.playPlace();
        console.log(`[PLACE] Placed shape at (${position.x}, ${position.y}), total blocks: ${this.state.placedBlocks.length}`);

        // Shape was already removed from queue when dragging started
        this.shapesPlacedThisTurn++;
        this.state.totalShapesPlaced++;
        this.state.turn++;
        this.updateTurnDisplay();

        // Color scheme updates are now handled when level changes (every 10 levels)

        // Check for full rows and columns
        this.checkAndClearLines();

        // If required number of shapes have been placed, generate new queue based on mode
        if (this.shapesPlacedThisTurn >= GAMEPLAY_CONFIG.shapesPerTurn) {
            this.shapesPlacedThisTurn = 0;
            this.state.queue = this.settings.mode === 'easy'
                ? generateEasyShapes(this.board)
                : generateShapes();
            
            // Check for game over at the beginning of each new round (after queue regeneration)
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q);
            if (activeQueue.length > 0) {
                const isGameOver = checkGameOver(this.board, activeQueue);
                if (isGameOver) {
                    this.triggerGameOver();
                }
            }
        } else {
            // Check for game over after placing a shape (in case lines cleared made room)
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q);
            if (activeQueue.length > 0) {
                const isGameOver = checkGameOver(this.board, activeQueue);
                if (isGameOver) {
                    this.triggerGameOver();
                }
            } else {
                // If queue is empty, game is not over yet (waiting for new shapes)
                this.state.gameOver = false;
                this.gameOverStartTime = null;
            }
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
                        // Add staggered delay based on position for more varied animations
                        // Calculate delay: cells in rows clear left-to-right, columns clear top-to-bottom
                        let staggerDelay = 0;
                        if (inClearedRow) {
                            // Stagger horizontally: left cells clear first
                            staggerDelay = absoluteX * 15; // 15ms per cell
                        } else if (inClearedColumn) {
                            // Stagger vertically: top cells clear first
                            staggerDelay = absoluteY * 15; // 15ms per cell
                        }
                        
                        // Use one animation per level (level-based, not cycling)
                        const animationIndex = (this.state.level - 1) % 17;
                        
                        // Add to animating cells with animation index and staggered start time
                        this.animatingCells.push({
                            x: absoluteX,
                            y: absoluteY,
                            color: block.color,
                            startTime: currentTime + staggerDelay,
                            progress: 0,
                            type: 'clear',
                            animationIndex: animationIndex
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
            fullRows,
            fullColumns,
            this.state.placedBlocks,
            boardCleared,
            this.state.totalShapesPlaced
        );
        this.state.score += points;
        this.updateScoreDisplay();
        this.soundManager.playClear(linesCleared, boardCleared);

        // Vibrate on mobile when line/column is completed
        if (linesCleared > 0 && 'vibrate' in navigator) {
            // Short vibration pattern: vibrate for 50ms
            navigator.vibrate(50);
        }

        // Update lines cleared counter
        this.state.linesCleared += linesCleared;
        this.updateLinesDisplay();

        // Darken all remaining blocks and increment their line clear bonuses
        this.state.placedBlocks.forEach(block => {
            block.darkness = Math.max(0, block.darkness - GAMEPLAY_CONFIG.darknessReduction);
            block.lineClearBonuses += linesCleared; // Increment line clear bonuses by 1 for each line/column cleared
        });

        // Update level progress
        this.state.levelProgress += linesCleared * GAMEPLAY_CONFIG.levelProgressPerLine;
        // Check for level up
        const previousLevel = this.state.level;
        
        while (this.state.levelProgress >= GAMEPLAY_CONFIG.levelProgressThreshold) {
            this.state.levelProgress -= GAMEPLAY_CONFIG.levelProgressThreshold;
            this.state.level++;
        }
        
        // Update color scheme if level changed (colors change every level up to level 10)
        if (this.state.level !== previousLevel) {
            console.log(`[COLOR] Level changed from ${previousLevel} to ${this.state.level}`);
            updateColorScheme(this.state.level);
            // Update colors for all placed blocks
            this.state.placedBlocks.forEach(block => {
                block.color = getShapeColor(block.shapeIndex);
            });
            // Update UI colors to match new level
            this.updateUIColors();
            // Start level up animation
            this.levelUpStartTime = Date.now();
            // Force a re-render to show new colors in queue
            this.render();
        }
        
        this.updateLevelDisplay();

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
    /**
     * Formats a number with commas (e.g., 1234 -> "1,234")
     */
    private formatNumber(num: number): string {
        return num.toLocaleString('en-US');
    }

    private updateScoreDisplay(): void {
        if (this.scoreElement) {
            this.scoreElement.textContent = this.formatNumber(this.state.score);
        }
    }

    /**
     * Updates the turn display in the UI
     */
    private updateTurnDisplay(): void {
        if (this.turnElement) {
            this.turnElement.textContent = this.formatNumber(this.state.turn);
        }
    }

    /**
     * Updates the lines cleared display in the UI
     */
    private updateLinesDisplay(): void {
        if (this.linesElement) {
            this.linesElement.textContent = this.formatNumber(this.state.linesCleared);
        }
    }

    /**
     * Updates UI colors (buttons, score displays, high scores) to match the current level's color scheme
     */
    private updateUIColors(): void {
        const uiColor = getUIColorForLevel(this.state.level, this.settings.theme);
        const buttonColors = getButtonColors(uiColor, this.settings.theme);

        // Update CSS variables on body element (where theme is applied)
        // This ensures our dynamic values override the theme-specific CSS rules
        const body = document.body;
        if (body) {
            body.style.setProperty('--accent-color', buttonColors.base);
            body.style.setProperty('--button-hover', buttonColors.hover);
            body.style.setProperty('--button-active', buttonColors.active);
            body.style.setProperty('--accent-color-contrast', buttonColors.contrast);
            body.style.setProperty('--settings-button-color', buttonColors.base);
        }
    }

    /**
     * Updates the level display in the UI
     */
    private updateLevelDisplay(): void {
        // Calculate number of boxes (one per line to complete level)
        const linesPerLevel = Math.ceil(GAMEPLAY_CONFIG.levelProgressThreshold / GAMEPLAY_CONFIG.levelProgressPerLine);
        const progressBoxes = document.querySelectorAll('.progress-box');
        const filledCount = Math.floor((this.state.levelProgress / GAMEPLAY_CONFIG.levelProgressThreshold) * linesPerLevel);
        
        progressBoxes.forEach((box, index) => {
            if (index < filledCount) {
                box.classList.add('filled');
            } else {
                box.classList.remove('filled');
            }
        });
    }


    /**
     * Automatically places all three pieces in the queue using optimal placement order
     */
    autoPlacePieces(): void {
        if (this.state.gameOver) {
            return;
        }

        // Find optimal placement order
        const placementOrder = findOptimalPlacementOrder(this.board, this.state.queue);
        
        if (!placementOrder || placementOrder.length === 0) {
            console.warn('[AUTO-PLACE] No valid placement order found');
            return;
        }

        // Place each shape in the optimal order
        // We need to place them one at a time, waiting for line clears between each
        // For now, we'll place them sequentially with a small delay
        placementOrder.forEach(({ shapeIndex, position }, index) => {
            setTimeout(() => {
                const shape = this.state.queue[shapeIndex];
                if (!shape) {
                    return;
                }

                // Temporarily restore the shape to queue if it was removed
                this.state.queue[shapeIndex] = shape;
                this.inputHandler.updateQueue(this.state.queue);

                // Create a temporary drag state to simulate placement
                const dragState = this.inputHandler.getDragState();
                // We need to manually trigger placement since we're bypassing drag
                // For now, we'll directly call handlePlaceShape logic
                this.placeShapeDirectly(shape, position, shapeIndex);
            }, index * 100); // Small delay between placements
        });
    }

    /**
     * Directly places a shape on the board (used by auto-place)
     */
    private placeShapeDirectly(shape: Shape, position: Position, queueIndex: number): void {
        if (this.state.gameOver) {
            return;
        }

        // Remove shape from queue
        this.state.queue[queueIndex] = null;
        this.inputHandler.updateQueue(this.state.queue);

        const shapeIndexInPool = getShapeIndex(shape);
        const shapeColor = getShapeColor(shapeIndexInPool);
        const basePointValue = getShapePointValue(shapeIndexInPool, 0);

        // Place the shape on the board
        this.board.placeShape(shape, position);

        // Add to placed blocks
        const placedBlock: PlacedBlock = {
            shape,
            position,
            color: shapeColor,
            pointValue: basePointValue,
            lineClearBonuses: 0,
            totalShapesPlacedAtPlacement: this.state.totalShapesPlaced,
            shapeIndex: shapeIndexInPool,
            darkness: 1.0,
        };
        this.state.placedBlocks.push(placedBlock);
        this.soundManager.resumeContext();
        this.soundManager.playPlace();

        this.shapesPlacedThisTurn++;
        this.state.totalShapesPlaced++;
        this.state.turn++;
        this.updateTurnDisplay();

        // Check for full rows and columns
        this.checkAndClearLines();

        // If required number of shapes have been placed, generate new queue
        if (this.shapesPlacedThisTurn >= GAMEPLAY_CONFIG.shapesPerTurn) {
            this.shapesPlacedThisTurn = 0;
            this.state.queue = this.settings.mode === 'easy'
                ? generateEasyShapes(this.board)
                : generateShapes();
            // Update input handler with new queue
            this.inputHandler.updateQueue(this.state.queue);
            
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q);
            if (activeQueue.length > 0) {
                const isGameOver = checkGameOver(this.board, activeQueue);
                if (isGameOver) {
                    this.triggerGameOver();
                }
            }
        } else {
            // Update input handler with current queue state
            this.inputHandler.updateQueue(this.state.queue);
            
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q);
            if (activeQueue.length > 0) {
                const isGameOver = checkGameOver(this.board, activeQueue);
                if (isGameOver) {
                    this.triggerGameOver();
                }
            } else {
                // If queue is empty, game is not over yet (waiting for new shapes)
                this.state.gameOver = false;
                this.gameOverStartTime = null;
            }
        }

        this.updateScoreDisplay();
    }

    /**
     * Awards bonus points for remaining cells when the game ends, animating them one at a time.
     */
    private awardGameOverBonus(): void {
        // Collect all cells with their positions and point values
        const cellsToClear: Array<{
            x: number;
            y: number;
            color: string;
            pointValue: number;
        }> = [];

        for (const block of this.state.placedBlocks) {
            // Calculate point value for game over bonus: base value + increments since placement
            const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
            const currentLevel = Math.floor(this.state.totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
            
            // Each block increments by points per tier for every tier of shapes placed after it was placed
            const levelIncrements = currentLevel - placementLevel;
            const currentPointValue = block.pointValue + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
            
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                cellsToClear.push({
                    x: absoluteX,
                    y: absoluteY,
                    color: block.color,
                    pointValue: currentPointValue,
                });
            }
        }

        if (cellsToClear.length === 0) {
            this.board.reset();
            this.state.placedBlocks = [];
            this.animatingCells = [];
            return;
        }

        // Shuffle for random order
        for (let i = cellsToClear.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cellsToClear[i], cellsToClear[j]] = [cellsToClear[j], cellsToClear[i]];
        }

        // Animate and clear cells one at a time
        const POP_DELAY = GAME_OVER_CONFIG.popDelayMs;
        const POP_ANIMATION_DURATION = GAME_OVER_CONFIG.popAnimationDurationMs;

        cellsToClear.forEach((cell, index) => {
            setTimeout(() => {
                // Add to animating cells with random animation index (0-9)
                const randomAnimIndex = Math.floor(Math.random() * 10);
                this.animatingCells.push({
                    x: cell.x,
                    y: cell.y,
                    color: cell.color,
                    startTime: Date.now(),
                    progress: 0,
                    type: 'clear',
                    animationIndex: randomAnimIndex,
                });

                // Play pop sound
                this.soundManager.playPop();

                // Add points
                this.state.score += cell.pointValue;
                this.updateScoreDisplay();

                // Remove from board
                this.board.clearCell(cell.x, cell.y);

                // Remove from placed blocks
                this.removeCellFromPlacedBlocks(cell.x, cell.y);

                // Clean up animation after it completes
                setTimeout(() => {
                    this.animatingCells = this.animatingCells.filter(
                        ac => !(ac.x === cell.x && ac.y === cell.y)
                    );
                }, POP_ANIMATION_DURATION);
            }, index * POP_DELAY);
        });

        // Mark popping complete and start fade animation after all pops finish
        const totalPopDuration = cellsToClear.length * POP_DELAY + POP_ANIMATION_DURATION;
        setTimeout(() => {
            this.gameOverPopComplete = true;
            // Start the fade overlay animation now
            this.gameOverStartTime = Date.now();
        }, totalPopDuration);

        // Final cleanup after all animations
        setTimeout(() => {
            // Record the final score for the current mode
            recordScore(this.state.score, this.settings.mode);
            this.board.reset();
            this.state.placedBlocks = [];
            this.animatingCells = [];
        }, totalPopDuration);
    }

    /**
     * Removes a specific cell from placed blocks.
     */
    private removeCellFromPlacedBlocks(x: number, y: number): void {
        this.state.placedBlocks = this.state.placedBlocks
            .map(block => {
                const remainingCells = block.shape.filter(cell => {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    return !(absoluteX === x && absoluteY === y);
                });

                if (remainingCells.length === 0) {
                    return null;
                }

                return {
                    ...block,
                    shape: remainingCells,
                };
            })
            .filter((block): block is PlacedBlock => block !== null);
    }

    /**
     * Transitions the game into the game-over state with audio/visual feedback.
     */
    private triggerGameOver(): void {
        if (this.state.gameOver) {
            return;
        }

        this.state.gameOver = true;
        this.gameOverPopComplete = false;
        this.gameOverStartTime = null; // Will be set after popping completes
        this.soundManager.playGameOver();
        // Start the bonus animation after a brief delay
        setTimeout(() => {
            this.awardGameOverBonus();
        }, GAME_OVER_CONFIG.restartDelayMs);
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
            level: 1,
            levelProgress: 0,
            totalShapesPlaced: 0,
            turn: 0,
            linesCleared: 0,
        };
        this.shapesPlacedThisTurn = 0;
        this.animatingCells = [];
        this.gameOverStartTime = null;
        this.inputHandler.updateBoard(this.board);
        this.inputHandler.updateQueue(this.state.queue);
        this.renderer.updateSettings(this.settings);
        // Reset final board snapshot when game resets
        this.renderer.resetFinalBoardSnapshot();
        // Initialize color scheme for starting level
        updateColorScheme(this.state.level);
        // Initialize UI colors for starting level
        this.updateUIColors();
        this.updateScoreDisplay();
        this.updateTurnDisplay();
        this.updateLinesDisplay();
        this.updateLevelDisplay();
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

    /**
     * Resumes the sound context (for autoplay policy)
     */
    resumeSoundContext(): void {
        this.soundManager.resumeContext();
    }

    /**
     * Checks if a game is currently in session (not game over and has started)
     * @returns true if game is active and in progress
     */
    isGameInSession(): boolean {
        return !this.state.gameOver && (this.state.placedBlocks.length > 0 || this.state.turn > 0);
    }
}
